const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const url = require('url');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const fileSystem = require('./src/main/fileSystem');

// Convert callback-based fs methods to Promise-based
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

// Window state persistence
const windowStateFile = path.join(app.getPath('userData'), 'window-state.json');
const indexDataFile = path.join(app.getPath('userData'), 'index-data.json');

// Store indexed chunks in memory
let indexedChunks = [];

// Load indexed chunks from disk if available
function loadIndexedChunks() {
  try {
    if (fs.existsSync(indexDataFile)) {
      const data = fs.readFileSync(indexDataFile, 'utf8');
      indexedChunks = JSON.parse(data);
      console.log(`Loaded ${indexedChunks.length} indexed chunks from disk`);
      return true;
    }
  } catch (error) {
    console.error('Failed to load indexed chunks:', error);
  }
  return false;
}

// Save indexed chunks to disk
function saveIndexedChunks() {
  try {
    fs.writeFileSync(indexDataFile, JSON.stringify(indexedChunks));
    console.log(`Saved ${indexedChunks.length} indexed chunks to disk`);
    return true;
  } catch (error) {
    console.error('Failed to save indexed chunks:', error);
    return false;
  }
}

function saveWindowState(window) {
  if (!window.isMaximized() && !window.isMinimized()) {
    const bounds = window.getBounds();
    const state = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      isMaximized: window.isMaximized()
    };
    
    // Add last indexed folder if available
    if (global.lastIndexedFolder) {
      state.lastIndexedFolder = global.lastIndexedFolder;
    }
    
    try {
      fs.writeFileSync(windowStateFile, JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save window state:', error);
    }
  }
}

function loadWindowState() {
  try {
    if (fs.existsSync(windowStateFile)) {
      return JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
    }
  } catch (error) {
    console.error('Failed to load window state:', error);
  }
  
  return null;
}

let mainWindow;
let splashWindow;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    center: true,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load splash screen HTML
  splashWindow.loadURL(
    isDev
      ? `data:text/html,
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                background-color: transparent;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                overflow: hidden;
              }
              .splash-container {
                text-align: center;
                background-color: #4a6fa5;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                color: white;
              }
              .logo {
                font-size: 36px;
                font-weight: bold;
                margin-bottom: 20px;
              }
              .loading {
                width: 100%;
                height: 4px;
                background-color: rgba(255,255,255,0.2);
                border-radius: 2px;
                overflow: hidden;
                position: relative;
              }
              .loading-bar {
                position: absolute;
                width: 30%;
                height: 100%;
                background-color: white;
                border-radius: 2px;
                animation: loading 1.5s infinite ease-in-out;
              }
              @keyframes loading {
                0% { left: -30%; }
                100% { left: 100%; }
              }
            </style>
          </head>
          <body>
            <div class="splash-container">
              <div class="logo">HereIAm</div>
              <p>Starting application...</p>
              <div class="loading">
                <div class="loading-bar"></div>
              </div>
            </div>
          </body>
        </html>
      `
      : `data:text/html,
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 0;
                font-family: Arial, sans-serif;
                background-color: transparent;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                overflow: hidden;
              }
              .splash-container {
                text-align: center;
                background-color: #4a6fa5;
                border-radius: 10px;
                padding: 30px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                color: white;
              }
              .logo {
                font-size: 36px;
                font-weight: bold;
                margin-bottom: 20px;
              }
              .loading {
                width: 100%;
                height: 4px;
                background-color: rgba(255,255,255,0.2);
                border-radius: 2px;
                overflow: hidden;
                position: relative;
              }
              .loading-bar {
                position: absolute;
                width: 30%;
                height: 100%;
                background-color: white;
                border-radius: 2px;
                animation: loading 1.5s infinite ease-in-out;
              }
              @keyframes loading {
                0% { left: -30%; }
                100% { left: 100%; }
              }
            </style>
          </head>
          <body>
            <div class="splash-container">
              <div class="logo">HereIAm</div>
              <p>Starting application...</p>
              <div class="loading">
                <div class="loading-bar"></div>
              </div>
            </div>
          </body>
        </html>
      `
  );

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  // Load saved window state or use defaults
  const windowState = loadWindowState();
  
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: windowState ? windowState.width : 1200,
    height: windowState ? windowState.height : 800,
    x: windowState ? windowState.x : undefined,
    y: windowState ? windowState.y : undefined,
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

  // Maximize the window if it was maximized before or on first run
  if (!windowState || windowState.isMaximized) {
    mainWindow.maximize();
  }

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
    // Close splash screen and show main window
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Save window state when closing
  mainWindow.on('close', () => {
    saveWindowState(mainWindow);
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
app.whenReady().then(async () => {
  // Load indexed chunks if available
  loadIndexedChunks();
  
  // Setup Python environment
  try {
    await fileSystem.setupPythonEnvironment();
  } catch (error) {
    console.error('Failed to setup Python environment:', error);
    // Continue anyway, we'll show an error in the UI if needed
  }
  
  createSplashWindow();
  setTimeout(() => {
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
  }, 1000); // Delay main window creation to show splash screen for at least 1 second
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
    // Save the folder path globally
    global.lastIndexedFolder = directoryPath;
    
    // Update window state with the folder path
    try {
      let state = {};
      if (fs.existsSync(windowStateFile)) {
        state = JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
      }
      state.lastIndexedFolder = directoryPath;
      fs.writeFileSync(windowStateFile, JSON.stringify(state));
    } catch (error) {
      console.error('Error updating window state with folder path:', error);
    }
    
    // Scan directory for files
    const allFiles = await fileSystem.scanDirectory(directoryPath, fileExtensions);
    
    // DEV LIMIT: Only process the first 25 files
    const files = isDev ? allFiles.slice(0, 25) : allFiles;
    console.log(`Found ${allFiles.length} files, processing ${files.length} files (dev limit: ${isDev})`);
    
    // Clear existing indexed chunks
    indexedChunks = [];
    
    // Process each file
    let processedFiles = 0;
    const totalFiles = files.length;
    
    // Process files in batches to avoid memory issues
    const batchSize = 5;
    for (let i = 0; i < totalFiles; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      
      // Process each file in the batch
      const batchChunks = [];
      for (const filePath of batch) {
        try {
          const chunks = await fileSystem.extractTextChunks(filePath);
          batchChunks.push(...chunks);
          
          // Update progress
          processedFiles++;
          const progress = Math.round((processedFiles / totalFiles) * 100);
          mainWindow.webContents.send('indexing-progress', { 
            progress, 
            currentFile: filePath,
            processedFiles,
            totalFiles,
            totalFilesFound: allFiles.length
          });
        } catch (error) {
          console.error(`Error processing file ${filePath}:`, error);
        }
      }
      
      // Generate embeddings for the batch
      if (batchChunks.length > 0) {
        try {
          const chunksWithEmbeddings = await fileSystem.generateEmbeddings(batchChunks);
          indexedChunks.push(...chunksWithEmbeddings);
        } catch (error) {
          console.error('Error generating embeddings:', error);
        }
      }
    }
    
    // Save indexed chunks to disk
    saveIndexedChunks();
    
    return { 
      success: true, 
      files,
      chunksCount: indexedChunks.length,
      totalFilesFound: allFiles.length
    };
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

// Handle search
ipcMain.handle('search', async (event, query) => {
  try {
    if (indexedChunks.length === 0) {
      return { 
        success: false, 
        error: 'No documents indexed. Please index a folder first.' 
      };
    }
    
    const results = await fileSystem.searchChunks(query, indexedChunks);
    
    return { 
      success: true, 
      results 
    };
  } catch (error) {
    console.error('Error searching:', error);
    return { success: false, error: error.message };
  }
});

// Handle checking if we have indexed data
ipcMain.handle('check-indexed-data', async () => {
  try {
    // If we don't have indexed chunks in memory, try to load them from disk
    if (indexedChunks.length === 0) {
      loadIndexedChunks();
    }
    
    // Get the folder path from the window state if available
    let folderPath = null;
    try {
      if (fs.existsSync(windowStateFile)) {
        const state = JSON.parse(fs.readFileSync(windowStateFile, 'utf8'));
        if (state.lastIndexedFolder) {
          folderPath = state.lastIndexedFolder;
        }
      }
    } catch (error) {
      console.error('Error reading window state:', error);
    }
    
    return { 
      success: true, 
      hasData: indexedChunks.length > 0,
      chunksCount: indexedChunks.length,
      folderPath
    };
  } catch (error) {
    console.error('Error checking indexed data:', error);
    return { success: false, error: error.message };
  }
}); 