const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  platform: process.platform,
  
  // File system operations
  scanDirectory: (directoryPath, fileExtensions) => 
    ipcRenderer.invoke('scan-directory', directoryPath, fileExtensions),
  
  readFile: (filePath) => 
    ipcRenderer.invoke('read-file', filePath),
  
  extractChunks: (filePath, chunkSize) => 
    ipcRenderer.invoke('extract-chunks', filePath, chunkSize)
}); 