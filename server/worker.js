const { parentPort, workerData } = require('worker_threads');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const { url, format, downloadId, chunkSize, savePath, proxy } = workerData;

const mapFormat = (format) => {
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
};

const generateUniqueFilename = (baseFilename) => {
  let filename = baseFilename;
  let counter = 1;
  const ext = path.extname(baseFilename);
  const name = path.basename(baseFilename, ext);

  while (fs.existsSync(path.join(savePath, filename))) {
    filename = `${name} (${counter})${ext}`;
    counter++;
  }
  return filename;
};

let command;
if (format.startsWith('mp3')) {
  const quality = format.includes('320') ? '0' : '5';
  command = `yt-dlp -x --audio-format mp3 --audio-quality ${quality} --socket-timeout 30 --retries 10 --fragment-retries 10 --newline -o "${path.join(savePath, '%(title)s.mp3')}" "${url}"`;
} else if (['m4a', 'wav'].includes(format)) {
  command = `yt-dlp -x --audio-format ${format} --socket-timeout 30 --retries 10 --fragment-retries 10 --newline -o "${path.join(savePath, '%(title)s.' + format)}" "${url}"`;
} else {
  command = `yt-dlp -f "${mapFormat(format)}" --merge-output-format ${format.split('-')[0]} --socket-timeout 30 --retries 10 --fragment-retries 10 --newline -o "${path.join(savePath, '%(title)s.' + format.split('-')[0])}" "${url}"`;
}

const ytDlpProcess = exec(command, { env: { ...process.env, HTTP_PROXY: proxy?.host } });

ytDlpProcess.stdout.on('data', (data) => {
  const output = data.toString();
  const progressMatch = output.match(/\[download\]\s+(\d+\.\d+)%/);
  if (progressMatch) {
    parentPort.postMessage({ progress: parseFloat(progressMatch[1]), status: 'downloading', message: `Downloading: ${Math.round(parseFloat(progressMatch[1]))}%` });
  }

  const filenameMatch = output.match(/\[download\] Destination: .+\\(.+)/);
  if (filenameMatch) {
    const originalFilename = filenameMatch[1].trim();
    const uniqueFilename = generateUniqueFilename(originalFilename);
    parentPort.postMessage({ filename: uniqueFilename });
    if (originalFilename !== uniqueFilename) {
      fs.renameSync(path.join(savePath, originalFilename), path.join(savePath, uniqueFilename));
    }
  }

  const typeMatch = output.match(/\[Merger\] Merging formats into ".+\.(\w+)"/);
  if (typeMatch) {
    parentPort.postMessage({ type: typeMatch[1] });
  }
});

ytDlpProcess.stderr.on('data', (data) => {
  if (!data.toString().includes('Retrying')) {
    parentPort.postMessage({ status: 'error', message: data.toString() });
  }
});

ytDlpProcess.on('close', (code) => {
  parentPort.postMessage({ status: code === 0 ? 'completed' : 'error', message: code === 0 ? 'Download completed' : 'Download failed' });
});