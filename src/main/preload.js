const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    scanDirectory: (directoryPath) => ipcRenderer.invoke('scan-directory', directoryPath),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    onFolderSelected: (callback) => {
      ipcRenderer.on('folder-selected', (event, folderPath) => {
        callback(folderPath);
      });
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('folder-selected');
    }
  }
); 