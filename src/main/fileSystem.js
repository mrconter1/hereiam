const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

// Convert callback-based fs methods to Promise-based
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

/**
 * Recursively scans a directory for text files
 * @param {string} directoryPath - The directory to scan
 * @param {Array<string>} fileExtensions - File extensions to include (e.g., ['.txt', '.md'])
 * @returns {Promise<Array<string>>} - Array of file paths
 */
async function scanDirectory(directoryPath, fileExtensions = ['.txt', '.md', '.js', '.html', '.css', '.json']) {
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
  return files;
}

/**
 * Reads the content of a text file
 * @param {string} filePath - Path to the file
 * @returns {Promise<string>} - File content
 */
async function readTextFile(filePath) {
  try {
    const content = await readFileAsync(filePath, 'utf8');
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    throw error;
  }
}

/**
 * Extracts text chunks from a file
 * @param {string} filePath - Path to the file
 * @param {number} chunkSize - Maximum size of each chunk in characters
 * @returns {Promise<Array<{text: string, filePath: string, startPos: number}>>} - Array of text chunks
 */
async function extractTextChunks(filePath, chunkSize = 1000) {
  const content = await readTextFile(filePath);
  const chunks = [];
  
  // Simple chunking by paragraphs
  const paragraphs = content.split(/\n\s*\n/);
  let currentChunk = '';
  let startPos = 0;
  
  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push({
        text: currentChunk,
        filePath,
        startPos
      });
      currentChunk = paragraph;
      startPos += currentChunk.length;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentChunk) {
    chunks.push({
      text: currentChunk,
      filePath,
      startPos
    });
  }
  
  return chunks;
}

module.exports = {
  scanDirectory,
  readTextFile,
  extractTextChunks
}; 