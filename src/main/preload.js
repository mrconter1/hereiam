const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'electron',
  {
    selectDirectory: () => ipcRenderer.invoke('select-directory'),
    scanDirectory: (directoryPath, fileExtensions, granularityLevels) => 
      ipcRenderer.invoke('scan-directory', directoryPath, fileExtensions, granularityLevels),
    readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
    search: (query, granularityLevels) => ipcRenderer.invoke('search', query, granularityLevels),
    checkIndexedData: () => ipcRenderer.invoke('check-indexed-data'),
    onFolderSelected: (callback) => {
      ipcRenderer.on('folder-selected', (event, folderPath) => {
        callback(folderPath);
      });
    },
    onIndexingProgress: (callback) => {
      ipcRenderer.on('indexing-progress', (event, progress) => {
        callback(progress);
      });
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('folder-selected');
      ipcRenderer.removeAllListeners('indexing-progress');
    }
  }
); 