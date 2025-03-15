const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const url = require('url');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
    frame: true, // Use native window frame
    titleBarStyle: 'default',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src/main/preload.js')
    }
  });

  // Load the Vite dev server in development
  mainWindow.loadURL(
    isDev
      ? 'http://localhost:5173'
      : url.format({
          pathname: path.join(__dirname, 'dist/renderer/index.html'),
          protocol: 'file:',
          slashes: true
        })
  );
  
  // Show window when ready to avoid flickering
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Folder',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            if (mainWindow) {
              const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory']
              });
              
              if (!result.canceled && result.filePaths.length > 0) {
                mainWindow.webContents.send('folder-selected', result.filePaths[0]);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => {
            if (mainWindow) {
              if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
              } else {
                mainWindow.webContents.openDevTools();
              }
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About HereIAm',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              title: 'About HereIAm',
              message: 'HereIAm',
              detail: 'Version 1.0.0\nA document indexing and search application.\n\n© 2023 HereIAm',
              buttons: ['OK'],
              icon: path.join(__dirname, 'assets/icon.png')
            });
          }
        },
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/yourusername/hereiam');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// When the app is ready, create the window and menu
app.whenReady().then(() => {
  createWindow();
  createMenu();
  
  // Register shortcut for opening folders (Ctrl+O)
  globalShortcut.register('CommandOrControl+O', async () => {
    if (mainWindow) {
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      });
      
      if (!result.canceled && result.filePaths.length > 0) {
        mainWindow.webContents.send('folder-selected', result.filePaths[0]);
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