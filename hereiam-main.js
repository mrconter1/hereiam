const { app, BrowserWindow, ipcMain, dialog, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// Convert callback-based fs methods to Promise-based
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

let mainWindow;

function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#f5f7fa',
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src/main/preload.js')
    }
  });

  // Load the Vite dev server in development
  mainWindow.loadURL('http://localhost:5173');
  
  // Show window when ready to avoid flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// When the app is ready, create the window
app.whenReady().then(() => {
  createWindow();
  
  // Register a keyboard shortcut to toggle DevTools (Ctrl+Shift+I)
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
      if (mainWindow.webContents.isDevToolsOpened()) {
        mainWindow.webContents.closeDevTools();
      } else {
        mainWindow.webContents.openDevTools();
      }
    }
  });
});

// Unregister shortcuts when app is quitting
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// On macOS, recreate a window when the dock icon is clicked
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
ipcMain.handle('scan-directory', async (event, directoryPath, fileExtensions = ['.txt', '.md', '.js', '.html', '.css', '.json']) => {
  try {
    const files = [];
    
    async function scan(currentPath) {
      const entries = await readdirAsync(currentPath);
      
      for (const entry of entries) {
        const entryPath = path.join(currentPath, entry);
        const stats = await statAsync(entryPath);
        
        if (stats.isDirectory()) {
          await scan(entryPath);
        } else if (stats.isFile()) {
          const ext = path.extname(entryPath).toLowerCase();
          if (fileExtensions.includes(ext) || fileExtensions.length === 0) {
            files.push(entryPath);
          }
        }
      }
    }
    
    await scan(directoryPath);
    return { success: true, files };
  } catch (error) {
    console.error('Error scanning directory:', error);
    return { success: false, error: error.message };
  }
});

// Handle reading file content
ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await readFileAsync(filePath, 'utf8');
    return { success: true, content };
  } catch (error) {
    console.error('Error reading file:', error);
    return { success: false, error: error.message };
  }
}); 