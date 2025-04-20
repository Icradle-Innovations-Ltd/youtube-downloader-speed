const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  onPauseDownloads: (callback) => ipcRenderer.on('pause-downloads', (event, ...args) => callback(...args)),
  onResumeDownloads: (callback) => ipcRenderer.on('resume-downloads', (event, ...args) => callback(...args)),
  pauseDownloads: () => ipcRenderer.send('pause-downloads'),
  resumeDownloads: () => ipcRenderer.send('resume-downloads')
});