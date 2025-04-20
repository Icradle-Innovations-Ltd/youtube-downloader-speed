import React, { useState, useEffect, useRef } from 'react';
import VideoPreview from './components/VideoPreview';
import DownloadOptions from './components/DownloadOptions';
import DownloadQueue from './components/DownloadQueue';
import DownloadHistory from './components/DownloadHistory';
import ErrorDashboard from './components/ErrorDashboard';
import ProxyTester from './components/ProxyTester';

const App = () => {
  const [urls, setUrls] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [activeTab, setActiveTab] = useState(localStorage.getItem('activeTab') || 'audio');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [downloads, setDownloads] = useState(new Map());
  const [isDarkMode, setIsDarkMode] = useState(localStorage.getItem('theme') === 'dark');
  const [videoQuality, setVideoQuality] = useState('all');
  const [preview, setPreview] = useState(null);
  const [language, setLanguage] = useState(navigator.language.split('-')[0] || 'en');
  const [bandwidthLimit, setBandwidthLimit] = useState(100);
  const [schedule, setSchedule] = useState(null);
  const [proxyConfig, setProxyConfig] = useState([]);
  const [savePath, setSavePath] = useState(null);
  const [showErrorDashboard, setShowErrorDashboard] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    fetch('http://localhost:3000/api/history')
      .then(res => res.json())
      .then(data => setHistory(data))
      .catch(err => setError(err.message));
  }, []);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    if (window.electronAPI?.onPauseDownloads) {
      window.electronAPI.onPauseDownloads(() => {
        Array.from(downloads.keys()).forEach(downloadId => pauseDownload(downloadId));
      });
    } else {
      console.error('onPauseDownloads is not defined in electronAPI');
    }
    window.electronAPI.onResumeDownloads(() => {
      Array.from(downloads.keys()).forEach(downloadId => resumeDownload(downloadId));
    });
  }, [downloads]);

  const selectSavePath = async () => {
    const path = await window.electronAPI.selectDirectory();
    if (path) setSavePath(path);
  };

  const fetchVideoInfo = async () => {
    const urlList = urls.trim().split('\n').filter(url => url.trim());
    if (!urlList.length) {
      setError('Please enter at least one valid YouTube URL');
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const response = await fetch(`http://localhost:3000/api/video-info?url=${encodeURIComponent(urlList[0])}`);
      const info = await response.json();
      if (info.error) throw new Error(info.error);
      setVideoInfo(info);
      window.electronAPI.showNotification({ title: 'Metadata Fetched', body: `Video: ${info.title}` });
    } catch (err) {
      setError(err.message);
      setVideoInfo(null);
      setShowErrorDashboard(true);
    } finally {
      setIsLoading(false);
    }
  };

  const startDownload = async (format, options = {}) => {
    const { priority = 0, convertTo, uploadToDrive } = options;
    const urlList = urls.trim().split('\n').filter(url => url.trim());
    if (!urlList.length) {
      setError('Please enter at least one valid YouTube URL');
      return;
    }
    if (!savePath) {
      setError('Please select a save directory');
      return;
    }

    if (schedule) {
      const now = new Date();
      const scheduledTime = new Date(schedule);
      if (scheduledTime > now) {
        setTimeout(() => startDownload(format, options), scheduledTime - now);
        setStatus(`Download scheduled for ${scheduledTime.toLocaleString()}`);
        return;
      }
    }

    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3000/api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urlList, format, priority, convertTo, uploadToDrive, savePath })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      data.downloadIds.forEach((downloadId, index) => {
        setDownloads(prev => new Map(prev).set(downloadId, { url: urlList[index], format, progress: 0, priority, savePath }));
        monitorProgress(downloadId, format, { convertTo, uploadToDrive });
      });
      urlList.forEach(url => updateHistory(url, format));
    } catch (err) {
      setError(err.message);
      setShowErrorDashboard(true);
    } finally {
      setIsLoading(false);
    }
  };

  const monitorProgress = (downloadId, format, options) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3000/api/progress/${downloadId}`);
        const data = await response.json();
        if (data.error) throw new Error(data.error);

        setDownloads(prev => {
          const newDownloads = new Map(prev);
          newDownloads.set(downloadId, { ...prev.get(downloadId), ...data });
          return newDownloads;
        });

        if (data.status === 'completed') {
          clearInterval(interval);
          setDownloads(prev => {
            const newDownloads = new Map(prev);
            newDownloads.delete(downloadId);
            return newDownloads;
          });
          if (options.convertTo) {
            const outputPath = data.path.replace(/\.\w+$/, `.${options.convertTo}`);
            await fetch('http://localhost:3000/api/convert', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ inputPath: data.path, outputFormat: options.convertTo })
            });
            data.path = outputPath;
          }
          if (options.uploadToDrive) {
            await fetch('http://localhost:3000/api/upload-drive', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ filePath: data.path, filename: data.filename })
            });
          }
          setStatus('Download completed successfully!');
          window.electronAPI.showNotification({ title: 'Download Complete', body: `File: ${data.filename}` });
        } else if (data.status === 'error') {
          clearInterval(interval);
          setDownloads(prev => {
            const newDownloads = new Map(prev);
            newDownloads.delete(downloadId);
            return newDownloads;
          });
          setError(data.message);
          setShowErrorDashboard(true);
        }
      } catch (err) {
        clearInterval(interval);
        setDownloads(prev => {
          const newDownloads = new Map(prev);
          newDownloads.delete(downloadId);
          return newDownloads;
        });
        setError(err.message);
        setShowErrorDashboard(true);
      }
    }, 1000);
  };

  const pauseDownload = async (downloadId) => {
    try {
      await fetch(`http://localhost:3000/api/pause-download/${downloadId}`, { method: 'POST' });
      setDownloads(prev => {
        const newDownloads = new Map(prev);
        const download = newDownloads.get(downloadId);
        if (download) newDownloads.set(downloadId, { ...download, status: 'paused' });
        return newDownloads;
      });
      setStatus('Download paused');
    } catch (err) {
      setError('Failed to pause download');
      setShowErrorDashboard(true);
    }
  };

  const resumeDownload = async (downloadId) => {
    try {
      await fetch(`http://localhost:3000/api/resume-download/${downloadId}`, { method: 'POST' });
      setDownloads(prev => {
        const newDownloads = new Map(prev);
        const download = newDownloads.get(downloadId);
        if (download) newDownloads.set(downloadId, { ...download, status: 'downloading' });
        return newDownloads;
      });
      setStatus('Download resumed');
    } catch (err) {
      setError('Failed to resume download');
      setShowErrorDashboard(true);
    }
  };

  const cancelDownload = async (downloadId) => {
    try {
      await fetch(`http://localhost:3000/api/cancel-download/${downloadId}`, { method: 'POST' });
      setDownloads(prev => {
        const newDownloads = new Map(prev);
        newDownloads.delete(downloadId);
        return newDownloads;
      });
      setStatus('Download cancelled');
    } catch (err) {
      setError('Failed to cancel download');
      setShowErrorDashboard(true);
    }
  };

  const previewFormat = async (format) => {
    const url = urls.trim().split('\n')[0];
    if (!url) {
      setError('Please fetch a video first');
      return;
    }

    try {
      const response = await fetch('http://localhost:3000/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setPreview({ url: data.previewUrl, format });
    } catch (err) {
      setError(err.message);
      setShowErrorDashboard(true);
    }
  };

  const updateHistory = (url, format) => {
    const timestamp = new Date().toLocaleString();
    setHistory(prev => [{ url, format, timestamp }, ...prev.slice(0, 9)]);
    fetch('http://localhost:3000/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format, timestamp })
    });
  };

  const exportHistory = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(history));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', 'download_history.json');
    downloadAnchor.click();
  };

  const importCsv = () => {
    fileInputRef.current.click();
  };

  const handleCsvUpload = async (e) => {
    if (!savePath) {
      setError('Please select a save directory');
      return;
    }
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const csvContent = event.target.result;
        const response = await fetch('http://localhost:3000/api/import-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ csvContent, savePath })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        data.downloadIds.forEach((downloadId, index) => {
          const [url, format, priority] = csvContent.split('\n')[index + 1].split(',');
          setDownloads(prev => new Map(prev).set(downloadId, { url, format, progress: 0, priority: parseInt(priority), savePath }));
          monitorProgress(downloadId, format);
        });
      } catch (err) {
        setError('Invalid CSV file');
        setShowErrorDashboard(true);
      }
    };
    reader.readAsText(file);
  };

  const clearInput = () => {
    setUrls('');
    setError('');
    setVideoInfo(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const text = e.dataTransfer.getData('text/plain');
    if (text.includes('youtube.com') || text.includes('youtu.be')) {
      setUrls(prev => prev ? `${prev}\n${text}` : text);
      fetchVideoInfo();
    }
  };

  const translations = {
    en: {
      fetch: 'Fetch',
      clear: 'Clear',
      download: 'Download',
      play: 'Play',
      cancel: 'Cancel',
      pause: 'Pause',
      resume: 'Resume',
      duration: 'Duration',
      views: 'Views',
      uploaded: 'Uploaded',
      channel: 'Channel',
      quality: 'Quality',
      format: 'Format',
      size: 'Size',
      preview: 'Preview',
      progress: 'Progress',
      downloadQueue: 'Download Queue',
      downloadHistory: 'Download History',
      export: 'Export',
      importCsv: 'Import CSV',
      errorDashboard: 'Error Dashboard',
      close: 'Close',
      proxySettings: 'Proxy Settings',
      testProxy: 'Test Proxy',
      addProxy: 'Add Proxy',
      noConversion: 'No Conversion',
      uploadToDrive: 'Upload to Drive',
      priority: 'Priority',
      selectDirectory: 'Select Save Directory'
    },
    es: {
      fetch: 'Obtener',
      clear: 'Limpiar',
      download: 'Descargar',
      play: 'Reproducir',
      cancel: 'Cancelar',
      pause: 'Pausar',
      resume: 'Reanudar',
      duration: 'Duración',
      views: 'Vistas',
      uploaded: 'Subido',
      channel: 'Canal',
      quality: 'Calidad',
      format: 'Formato',
      size: 'Tamaño',
      preview: 'Vista previa',
      progress: 'Progreso',
      downloadQueue: 'Cola de descargas',
      downloadHistory: 'Historial de descargas',
      export: 'Exportar',
      importCsv: 'Importar CSV',
      errorDashboard: 'Panel de errores',
      close: 'Cerrar',
      proxySettings: 'Configuración de proxy',
      testProxy: 'Probar proxy',
      addProxy: 'Agregar proxy',
      noConversion: 'Sin conversión',
      uploadToDrive: 'Subir a Drive',
      priority: 'Prioridad',
      selectDirectory: 'Seleccionar directorio de guardado'
    }
  };

  return (
    <div
      className={`min-h-screen font-sans p-4 sm:p-8 ${isDarkMode ? 'dark bg-gray-900' : 'bg-gray-100'}`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <header className="max-w-4xl mx-auto mb-8 flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">🎥 YouTube Downloader</h1>
        <div className="flex gap-4">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className="p-2 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto">
        <section className="card p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-200">🔍 Enter YouTube URLs</h2>
          <div className="flex flex-col gap-4">
            <textarea
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              rows="4"
              placeholder="Paste one or more YouTube URLs (one per line)\nhttps://www.youtube.com/watch?v=..."
              className="w-full px-4 py-3 border rounded-lg focus:outline-pink-500 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700 resize-y"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  fetchVideoInfo();
                }
                if (e.key === 'Escape') clearInput();
              }}
            />
            <div className="flex gap-4">
              <button
                onClick={fetchVideoInfo}
                disabled={isLoading}
                className="gradient-bg text-white px-6 py-3 rounded-lg hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                <span>{translations[language].fetch}</span>
                {isLoading && (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
              </button>
              <button
                onClick={clearInput}
                className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-6 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                {translations[language].clear}
              </button>
              <button
                onClick={selectSavePath}
                className="bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-6 py-3 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                {savePath ? savePath : translations[language].selectDirectory}
              </button>
            </div>
            <div className="flex gap-4">
              <input
                type="datetime-local"
                value={schedule || ''}
                onChange={(e) => setSchedule(e.target.value)}
                className="border rounded-lg px-3 py-2 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-200"
              />
              <input
                type="range"
                min="10"
                max="100"
                value={bandwidthLimit}
                onChange={(e) => setBandwidthLimit(e.target.value)}
                className="w-32"
              />
              <span>{bandwidthLimit}%</span>
            </div>
          </div>
          {(error || status) && (
            <p className={`text-sm mt-2 ${error ? 'text-red-500' : 'text-green-500'}`}>
              {error || status}
            </p>
          )}
        </section>

        <ProxyTester proxyConfig={proxyConfig} setProxyConfig={setProxyConfig} translations={translations[language]} />

        {videoInfo && <VideoPreview videoInfo={videoInfo} translations={translations[language]} />}

        <DownloadOptions
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          videoQuality={videoQuality}
          setVideoQuality={setVideoQuality}
          downloads={downloads}
          startDownload={startDownload}
          previewFormat={previewFormat}
          translations={translations[language]}
        />

        <DownloadQueue
          downloads={downloads}
          pauseDownload={pauseDownload}
          resumeDownload={resumeDownload}
          cancelDownload={cancelDownload}
          translations={translations[language]}
        />

        <DownloadHistory
          history={history}
          setUrls={setUrls}
          fetchVideoInfo={fetchVideoInfo}
          exportHistory={exportHistory}
          importCsv={importCsv}
          translations={translations[language]}
        />

        {showErrorDashboard && (
          <ErrorDashboard
            errors={[error]}
            onClose={() => setShowErrorDashboard(false)}
            translations={translations[language]}
          />
        )}

        <input type="file" accept=".csv" ref={fileInputRef} onChange={handleCsvUpload} className="hidden" />

        {preview && (
          <div
            onClick={() => setPreview(null)}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          >
            <div className="bg-white dark:bg-gray-800 p-4 rounded-lg">
              <h3 className="text-lg font-semibold mb-2 text-gray-800 dark:text-gray-200">{translations[language].preview}</h3>
              {preview.format.startsWith('mp4') || preview.format === 'webm' || preview.format === 'mkv' ? (
                <video src={preview.url} controls className="mt-2 w-full rounded-lg" style={{ maxHeight: '200px' }} />
              ) : (
                <audio src={preview.url} controls className="mt-2 w-full rounded-lg" />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;