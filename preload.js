const { contextBridge, ipcRenderer } = require('electron');

console.log('preload.js: Exposing electronAPI');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  onPauseDownloads: (callback) => ipcRenderer.on('pause-downloads', (event, ...args) => callback(...args)),
  onResumeDownloads: (callback) => ipcRenderer.on('resume-downloads', (event, ...args) => callback(...args)),
  pauseDownloads: () => ipcRenderer.send('pause-downloads'),
  resumeDownloads: () => ipcRenderer.send('resume-downloads')
});

console.log('electronAPI exposed:', {
  onPauseDownloads: typeof window.electronAPI?.onPauseDownloads,
  onResumeDownloads: typeof window.electronAPI?.onResumeDownloads
});