const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const fileSystem = require('./fileSystem');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Handle folder selection
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  return result;
});

// Handle scanning directory for files
ipcMain.handle('scan-directory', async (event, directoryPath, fileExtensions) => {
  try {
    const files = await fileSystem.scanDirectory(directoryPath, fileExtensions);
    return { success: true, files };
  } catch (error) {
    console.error('Error scanning directory:', error);
    return { success: false, error: error.message };
  }
});

// Handle reading file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fileSystem.readTextFile(filePath);
    return { success: true, content };
  } catch (error) {
    console.error('Error reading file:', error);
    return { success: false, error: error.message };
  }
});

// Handle extracting text chunks from a file
ipcMain.handle('extract-chunks', async (event, filePath, chunkSize) => {
  try {
    const chunks = await fileSystem.extractTextChunks(filePath, chunkSize);
    return { success: true, chunks };
  } catch (error) {
    console.error('Error extracting chunks:', error);
    return { success: false, error: error.message };
  }
}); 