const { app, BrowserWindow, Tray, Menu } = require('electron');
const path = require('path');

let mainWindow;
let tray;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    },
    icon: path.join(__dirname, 'public/icon.png')
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, 'build', 'index.html')}`;
  mainWindow.loadURL(startUrl).catch(err => console.error('Failed to load URL:', err));
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Window loaded successfully');
  });
  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(() => {
  createWindow();
  tray = new Tray(path.join(__dirname, 'public/icon.png'));
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show App', click: () => mainWindow.show() },
    { 
      label: 'Pause Downloads', 
      click: () => {
        console.log('Sending pause-downloads IPC');
        mainWindow.webContents.send('pause-downloads');
      }
    },
    { 
      label: 'Resume Downloads', 
      click: () => {
        console.log('Sending resume-downloads IPC');
        mainWindow.webContents.send('resume-downloads');
      }
    },
    { label: 'Quit', click: () => app.quit() }
  ]);
  tray.setToolTip('YouTube Downloader');
  tray.setContextMenu(contextMenu);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});