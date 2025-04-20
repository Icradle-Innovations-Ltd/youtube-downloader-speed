const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const { Worker } = require('worker_threads');
const { google } = require('googleapis');
const ffmpeg = require('fluent-ffmpeg');
const { networkInterfaces } = require('os');

// SQLite Database Setup
const db = new sqlite3.Database(path.join(__dirname, '../downloader.db'), (err) => {
  if (err) console.error('Database error:', err);
  db.run(`
    CREATE TABLE IF NOT EXISTS metadata (
      url TEXT PRIMARY KEY,
      title TEXT,
      thumbnail TEXT,
      duration TEXT,
      views INTEGER,
      uploaded TEXT,
      channel TEXT,
      formats TEXT,
      expires INTEGER
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS progress (
      downloadId TEXT PRIMARY KEY,
      url TEXT,
      format TEXT,
      progress REAL,
      filename TEXT,
      type TEXT,
      status TEXT,
      lastChunk INTEGER,
      savePath TEXT
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      url TEXT,
      format TEXT,
      timestamp TEXT,
      size INTEGER,
      filename TEXT
    )
  `);
});

// Proxy Configuration
let proxies = [];
let currentProxyIndex = 0;

// Google Drive Integration
const drive = google.drive({ version: 'v3', auth: new google.auth.GoogleAuth({ keyFile: path.join(__dirname, 'credentials.json'), scopes: ['https://www.googleapis.com/auth/drive.file'] }) });

class DownloadManager {
  constructor() {
    this.activeDownloads = {};
    this.pausedDownloads = new Set();
    this.maxConcurrentDownloads = 4;
    this.downloadQueue = [];
    this.chunkSize = 1024 * 1024; // 1MB
    this.ensureDirectories();
  }

  ensureDirectories() {
    const downloadsDir = path.join(__dirname, '../downloads');
    const audioDir = path.join(downloadsDir, 'audio');
    const videoDir = path.join(downloadsDir, 'video');
    const previewDir = path.join(downloadsDir, 'preview');
    const thumbnailsDir = path.join(downloadsDir, 'thumbnails');

    [downloadsDir, audioDir, videoDir, previewDir, thumbnailsDir].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });
  }

  generateUniqueFilename(baseFilename, savePath) {
    let filename = baseFilename;
    let counter = 1;
    const ext = path.extname(baseFilename);
    const name = path.basename(baseFilename, ext);

    while (fs.existsSync(path.join(savePath, filename))) {
      filename = `${name} (${counter})${ext}`;
      counter++;
    }
    return filename;
  }

  async checkDiskSpace(savePath, size) {
    // Placeholder: Implement disk space check using `diskusage` or similar
    return true;
  }

  async getCachedMetadata(url) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM metadata WHERE url = ? AND expires > ?', [url, Date.now()], (err, row) => {
        if (err) reject(err);
        resolve(row ? { ...row, formats: JSON.parse(row.formats) } : null);
      });
    });
  }

  async cacheMetadata(url, data) {
    const expires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    db.run(
      'INSERT OR REPLACE INTO metadata (url, title, thumbnail, duration, views, uploaded, channel, formats, expires) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [url, data.title, data.thumbnail, data.duration, data.views, data.uploaded, data.channel, JSON.stringify(data.formats), expires],
      (err) => { if (err) console.error('Cache error:', err); }
    );
  }

  async getVideoInfo(url) {
    const cached = await this.getCachedMetadata(url);
    if (cached) return cached;

    return new Promise((resolve, reject) => {
      exec(`yt-dlp -J "${url}"`, { env: { ...process.env, HTTP_PROXY: proxies[currentProxyIndex]?.host } }, (error, stdout) => {
        if (error) {
          reject(new Error('Failed to fetch video info'));
          return;
        }
        try {
          const info = JSON.parse(stdout);
          const data = {
            title: info.title,
            thumbnail: info.thumbnail,
            duration: info.duration_string,
            views: info.view_count,
            uploaded: info.upload_date,
            channel: info.uploader,
            formats: []
          };
          this.cacheMetadata(url, data);
          resolve(data);
        } catch (err) {
          reject(new Error('Failed to parse video info'));
        }
      });
    });
  }

  async getVideoFormats(url) {
    const cached = await this.getCachedMetadata(url);
    if (cached) return cached.formats;

    return new Promise((resolve, reject) => {
      const command = `yt-dlp -F --format-sort quality --no-playlist "${url}"`;
      const timeout = setTimeout(() => reject(new Error('Timeout while fetching formats')), 30000);

      exec(command, { env: { ...process.env, HTTP_PROXY: proxies[currentProxyIndex]?.host } }, (error, stdout, stderr) => {
        clearTimeout(timeout);
        if (error) return reject(new Error(stderr || 'Failed to get video formats'));
        try {
          const formats = this.parseFormats(stdout);
          this.cacheMetadata(url, { formats });
          resolve(formats);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  parseFormats(output) {
    const lines = output.split('\n');
    const formats = [];
    let formatTableStarted = false;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;
      if (trimmedLine.startsWith('ID')) {
        formatTableStarted = true;
        continue;
      }
      if (formatTableStarted && /^[\w\d]+/.test(trimmedLine)) {
        const match = trimmedLine.match(/^(\S+)\s+(\S+)\s+(\S+)\s+(.*)/);
        if (match) {
          const [, id, ext, resolution, rest] = match;
          if (id === 'ID' || id.includes('storyboard')) continue;
          formats.push({ id, ext, resolution: resolution === 'audio' ? 'audio only' : resolution, note: rest.trim() });
        }
      }
    }
    return formats;
  }

  async generatePreview(url, format) {
    return new Promise((resolve, reject) => {
      const previewDir = path.join(__dirname, '../downloads', 'preview');
      const previewFile = `preview-${Date.now()}.${format.split('-')[0]}`;
      const outputPath = path.join(previewDir, previewFile);

      let command;
      if (format.startsWith('mp3') || format === 'm4a' || format === 'wav') {
        command = `yt-dlp -x --audio-format ${format.split('-')[0]} --audio-quality ${format.includes('320') ? '0' : '5'} -o "${outputPath}" --download-sections "*0:00-0:10" "${url}"`;
      } else {
        command = `yt-dlp -f ${this.mapFormat(format)} -o "${outputPath}" --download-sections "*0:00-0:10" "${url}"`;
      }

      exec(command, { env: { ...process.env, HTTP_PROXY: proxies[currentProxyIndex]?.host } }, (error) => {
        if (error) reject(new Error('Failed to generate preview'));
        else resolve(`/downloads/preview/${previewFile}`);
      });
    });
  }

  async convertFormat(inputPath, outputFormat, outputPath) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .format(outputFormat)
        .on('end', () => resolve(outputPath))
        .on('error', (err) => reject(new Error(`Conversion failed: ${err.message}`)))
        .run();
    });
  }

  async uploadToDrive(filePath, filename) {
    const fileStream = fs.createReadStream(filePath);
    const response = await drive.files.create({
      requestBody: { name: filename },
      media: { body: fileStream }
    });
    return response.data.id;
  }

  mapFormat(format) {
    const formatMap = {
      'mp4-4K': 'bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      'mp4-1080p': 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      'mp4-720p': 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      'mp4-360p': 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      'mp4-240p': 'bestvideo[height<=240][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      'mp4-144p': 'bestvideo[height<=144][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
      'webm': 'bestvideo[ext=webm]+bestaudio[ext=webm]/best[ext=webm]',
      'mkv': 'bestvideo[ext=mkv]+bestaudio[ext=m4a]/best[ext=mkv]',
      'm4a': 'bestaudio[ext=m4a]',
      'wav': 'bestaudio'
    };
    return formatMap[format] || 'best';
  }

  async startChunkedDownload(url, format, downloadId, priority = 0, savePath) {
    if (this.pausedDownloads.has(downloadId)) return;
    if (Object.keys(this.activeDownloads).length >= this.maxConcurrentDownloads) {
      this.downloadQueue.push({ url, format, downloadId, priority, savePath });
      this.downloadQueue.sort((a, b) => b.priority - a.priority);
      this.activeDownloads[downloadId] = { progress: 0, status: 'queued', message: 'Waiting in queue...', savePath };
      db.run(
        'INSERT OR REPLACE INTO progress (downloadId, url, format, progress, status, savePath) VALUES (?, ?, ?, ?, ?, ?)',
        [downloadId, url, format, 0, 'queued', savePath]
      );
      return;
    }

    this.activeDownloads[downloadId] = { progress: 0, status: 'starting', message: 'Starting download...', savePath };
    const worker = new Worker(path.join(__dirname, 'worker.js'), {
      workerData: { url, format, downloadId, chunkSize: this.chunkSize, savePath, proxy: proxies[currentProxyIndex] }
    });

    worker.on('message', (data) => {
      if (data.progress) {
        this.activeDownloads[downloadId] = { ...this.activeDownloads[downloadId], ...data };
        db.run(
          'INSERT OR REPLACE INTO progress (downloadId, url, format, progress, filename, type, status, lastChunk, savePath) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [downloadId, url, format, data.progress, data.filename, data.type, data.status, data.lastChunk || 0, savePath],
          (err) => { if (err) console.error('Progress save error:', err); }
        );
      }
    });

    worker.on('exit', (code) => {
      if (code === 0) {
        const download = this.activeDownloads[downloadId];
        if (download.filename && download.type) {
          this.moveFileToFolder(download.filename, download.type, savePath);
          db.run('UPDATE progress SET status = ? WHERE downloadId = ?', ['completed', downloadId]);
        }
      } else {
        this.activeDownloads[downloadId].status = 'error';
        db.run('UPDATE progress SET status = ? WHERE downloadId = ?', ['error', downloadId]);
      }
      delete this.activeDownloads[downloadId];
      this.processNextInQueue();
    });
  }

  moveFileToFolder(filename, type, savePath) {
    const downloadsDir = path.join(__dirname, '../downloads');
    const targetDir = type === 'mp3' || type === 'm4a' || type === 'wav' ? path.join(savePath, 'audio') : path.join(savePath, 'video');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const sourcePath = path.join(downloadsDir, filename);
    const targetPath = path.join(targetDir, filename);
    if (fs.existsSync(sourcePath)) {
      fs.renameSync(sourcePath, targetPath);
    }
  }

  processNextInQueue() {
    if (this.downloadQueue.length > 0 && Object.keys(this.activeDownloads).length < this.maxConcurrentDownloads) {
      const next = this.downloadQueue.shift();
      if (!this.pausedDownloads.has(next.downloadId)) {
        this.startChunkedDownload(next.url, next.format, next.downloadId, next.priority, next.savePath);
      }
    }
  }

  pauseDownload(downloadId) {
    if (this.activeDownloads[downloadId]) {
      this.pausedDownloads.add(downloadId);
      this.activeDownloads[downloadId].status = 'paused';
      db.run('UPDATE progress SET status = ? WHERE downloadId = ?', ['paused', downloadId]);
      this.processNextInQueue();
    }
  }

  resumeDownload(downloadId) {
    if (this.pausedDownloads.has(downloadId)) {
      this.pausedDownloads.delete(downloadId);
      const download = this.activeDownloads[downloadId];
      if (download) {
        this.startChunkedDownload(download.url, download.format, downloadId, download.priority || 0, download.savePath);
      }
    }
  }

  getDownloadStatus(downloadId) {
    const download = this.activeDownloads[downloadId];
    if (!download) {
      return new Promise((resolve) => {
        db.get('SELECT * FROM progress WHERE downloadId = ?', [downloadId], (err, row) => {
          if (err || !row) resolve(null);
          else resolve({ ...row, path: path.join(row.savePath, row.type === 'mp3' ? 'audio' : 'video', row.filename) });
        });
      });
    }
    return Promise.resolve(download);
  }

  cancelDownload(downloadId) {
    if (this.activeDownloads[downloadId]) {
      this.pausedDownloads.delete(downloadId);
      this.activeDownloads[downloadId].status = 'cancelled';
      delete this.activeDownloads[downloadId];
      db.run('UPDATE progress SET status = ? WHERE downloadId = ?', ['cancelled', downloadId]);
      this.processNextInQueue();
    }
  }

  async testProxy(proxy) {
    const start = Date.now();
    try {
      const response = await axios.get('https://api.ipify.org', { proxy, timeout: 5000 });
      return { success: true, latency: Date.now() - start, ip: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getSystemProxy() {
    // Placeholder: Use Windows registry or `wininet` to fetch system proxy settings
    return null;
  }
}

class YouTubeDownloaderApp {
  constructor() {
    this.app = express();
    this.downloadManager = new DownloadManager();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors({ origin: ['http://localhost:3000', 'http://192.168.1.138:3000'] }));
    this.app.use(express.json());
    this.app.use('/downloads', express.static(path.join(__dirname, '../downloads')));
  }

  setupRoutes() {
    this.app.post('/api/get-formats', this.handleGetFormats.bind(this));
    this.app.post('/api/download', this.handleDownload.bind(this));
    this.app.get('/api/progress/:id', this.handleProgress.bind(this));
    this.app.post('/api/cancel-download/:id', this.handleCancelDownload.bind(this));
    this.app.post('/api/pause-download/:id', this.handlePauseDownload.bind(this));
    this.app.post('/api/resume-download/:id', this.handleResumeDownload.bind(this));
    this.app.post('/api/preview', this.handlePreview.bind(this));
    this.app.get('/api/video-info', this.handleGetVideoInfo.bind(this));
    this.app.post('/api/convert', this.handleConvert.bind(this));
    this.app.post('/api/upload-drive', this.handleUploadDrive.bind(this));
    this.app.post('/api/test-proxy', this.handleTestProxy.bind(this));
    this.app.post('/api/import-csv', this.handleImportCsv.bind(this));
    this.app.get('/api/history', this.handleGetHistory.bind(this));
  }

  async handleGetFormats(req, res) {
    try {
      const { url } = req.body;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const formats = await this.downloadManager.getVideoFormats(url);
      res.json({ formats });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleDownload(req, res) {
    try {
      console.log('Request body:', req.body);
      const { urls, format, priority = 0, convertTo, uploadToDrive, savePath } = req.body;
      if (!urls || !Array.isArray(urls) || !format || !savePath) return res.status(400).json({ error: 'URLs, format, and save path required' });

      const downloadIds = urls.map(() => Date.now().toString() + Math.random().toString(36).slice(2));
      urls.forEach((url, index) => {
        this.downloadManager.startChunkedDownload(url, format, downloadIds[index], priority, savePath);
        if (convertTo || uploadToDrive) {
          db.run('INSERT INTO progress (downloadId, url, format, convertTo, uploadToDrive, savePath) VALUES (?, ?, ?, ?, ?, ?)', 
            [downloadIds[index], url, format, convertTo || null, uploadToDrive ? 1 : 0, savePath]);
        }
      });
      res.json({ downloadIds });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleProgress(req, res) {
    const status = await this.downloadManager.getDownloadStatus(req.params.id);
    if (!status) return res.status(404).json({ error: 'Download not found' });
    res.json(status);
  }

  async handleCancelDownload(req, res) {
    this.downloadManager.cancelDownload(req.params.id);
    res.json({ message: 'Download cancelled' });
  }

  async handlePauseDownload(req, res) {
    this.downloadManager.pauseDownload(req.params.id);
    res.json({ message: 'Download paused' });
  }

  async handleResumeDownload(req, res) {
    this.downloadManager.resumeDownload(req.params.id);
    res.json({ message: 'Download resumed' });
  }

  async handlePreview(req, res) {
    try {
      const { url, format } = req.body;
      if (!url || !format) return res.status(400).json({ error: 'URL and format required' });
      const previewUrl = await this.downloadManager.generatePreview(url, format);
      res.json({ previewUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetVideoInfo(req, res) {
    try {
      const { url } = req.query;
      if (!url) return res.status(400).json({ error: 'URL is required' });
      const info = await this.downloadManager.getVideoInfo(url);
      res.json(info);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleConvert(req, res) {
    try {
      const { inputPath, outputFormat } = req.body;
      if (!inputPath || !outputFormat) return res.status(400).json({ error: 'Input path and output format required' });
      const outputPath = inputPath.replace(/\.\w+$/, `.${outputFormat}`);
      await this.downloadManager.convertFormat(inputPath, outputFormat, outputPath);
      res.json({ outputPath });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleUploadDrive(req, res) {
    try {
      const { filePath, filename } = req.body;
      if (!filePath || !filename) return res.status(400).json({ error: 'File path and filename required' });
      const fileId = await this.downloadManager.uploadToDrive(filePath, filename);
      res.json({ fileId });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleTestProxy(req, res) {
    try {
      const { proxy } = req.body;
      if (!proxy) return res.status(400).json({ error: 'Proxy required' });
      const result = await this.downloadManager.testProxy(proxy);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleImportCsv(req, res) {
    try {
      const { csvContent, savePath } = req.body;
      if (!csvContent || !savePath) return res.status(400).json({ error: 'CSV content and save path required' });
      const lines = csvContent.split('\n').slice(1); // Skip header
      const downloads = lines.map(line => {
        const [url, format, priority] = line.split(',');
        return { url, format, priority: parseInt(priority) || 0 };
      }).filter(d => d.url && d.format);
      const downloadIds = downloads.map(() => Date.now().toString() + Math.random().toString(36).slice(2));
      downloads.forEach((d, i) => this.downloadManager.startChunkedDownload(d.url, d.format, downloadIds[i], d.priority, savePath));
      res.json({ downloadIds });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async handleGetHistory(req, res) {
    db.all('SELECT * FROM history ORDER BY timestamp DESC', (err, rows) => {
      if (err) res.status(500).json({ error: err.message });
      else res.json(rows);
    });
  }

  start(port = 3000) {
    this.app.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  }
}

const app = new YouTubeDownloaderApp();
app.start();