const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { spawn } = require('child_process');

// Convert callback-based fs methods to Promise-based
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

// Check if Python is installed and install required packages if needed
async function setupPythonEnvironment() {
  return new Promise((resolve, reject) => {
    const pip = spawn('pip', ['install', 'sentence-transformers', 'numpy', 'scikit-learn', '--user']);
    
    pip.stdout.on('data', (data) => {
      console.log(`pip stdout: ${data}`);
    });
    
    pip.stderr.on('data', (data) => {
      console.error(`pip stderr: ${data}`);
    });
    
    pip.on('close', (code) => {
      if (code === 0) {
        console.log('Python dependencies installed successfully');
        resolve(true);
      } else {
        console.error(`pip process exited with code ${code}`);
        reject(new Error(`Failed to install Python dependencies, exit code: ${code}`));
      }
    });
  });
}

/**
 * Recursively scans a directory for text files
 * @param {string} directoryPath - The directory to scan
 * @param {Array<string>} fileExtensions - File extensions to include
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
 * Chunks text into smaller segments
 * @param {string} text - The text to chunk
 * @param {number} maxChunkSize - Maximum size of each chunk
 * @returns {Array<string>} - Array of text chunks
 */
function chunkText(text, maxChunkSize = 1000) {
  // First try to split by double newlines (paragraphs)
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed the max size and we already have content
    if (currentChunk.length + paragraph.length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = paragraph;
    } else {
      // Either the chunk is empty or adding this paragraph won't exceed max size
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  // Add the last chunk if it has content
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  // If any chunks are still too large, split them further
  const finalChunks = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxChunkSize) {
      finalChunks.push(chunk);
    } else {
      // Split by sentences if paragraph is too large
      const sentences = chunk.split(/(?<=[.!?])\s+/);
      let sentenceChunk = '';
      
      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > maxChunkSize && sentenceChunk.length > 0) {
          finalChunks.push(sentenceChunk);
          sentenceChunk = sentence;
        } else {
          sentenceChunk += (sentenceChunk ? ' ' : '') + sentence;
        }
      }
      
      if (sentenceChunk) {
        finalChunks.push(sentenceChunk);
      }
    }
  }
  
  return finalChunks;
}

/**
 * Extracts text chunks from a file
 * @param {string} filePath - Path to the file
 * @param {number} chunkSize - Maximum size of each chunk in characters
 * @returns {Promise<Array<{text: string, filePath: string, startPos: number}>>} - Array of text chunks
 */
async function extractTextChunks(filePath, chunkSize = 1000) {
  // For development, use larger chunks and limit the number of chunks per file
  const isDev = process.env.NODE_ENV === 'development';
  const devChunkSize = 2000; // Larger chunks in dev mode
  const maxChunksPerFile = isDev ? 3 : Infinity; // Limit chunks per file in dev mode
  
  const actualChunkSize = isDev ? devChunkSize : chunkSize;
  
  const content = await readTextFile(filePath);
  const textChunks = chunkText(content, actualChunkSize);
  
  // Limit the number of chunks per file in dev mode
  const limitedChunks = textChunks.slice(0, maxChunksPerFile);
  
  const chunks = [];
  let startPos = 0;
  
  for (const text of limitedChunks) {
    chunks.push({
      text,
      filePath,
      startPos
    });
    
    // Update the start position for the next chunk
    startPos += text.length;
  }
  
  if (isDev && textChunks.length > maxChunksPerFile) {
    console.log(`Dev mode: Limited ${filePath} from ${textChunks.length} to ${maxChunksPerFile} chunks`);
  }
  
  return chunks;
}

/**
 * Generates embeddings for text chunks using Python and sentence-transformers
 * @param {Array<{text: string, filePath: string, startPos: number}>} chunks - Text chunks
 * @param {string} modelName - Name of the sentence-transformer model to use
 * @returns {Promise<Array<{text: string, filePath: string, startPos: number, embedding: Array<number>}>>} - Chunks with embeddings
 */
async function generateEmbeddings(chunks, modelName = 'all-MiniLM-L6-v2') {
  // For development, use a smaller model that loads faster
  const isDev = process.env.NODE_ENV === 'development';
  const embeddingModel = isDev ? 'paraphrase-MiniLM-L3-v2' : modelName;
  
  console.log(`Using embedding model: ${embeddingModel} (dev mode: ${isDev})`);
  
  // Create a temporary file to store the chunks
  const tempFilePath = path.join(__dirname, 'temp_chunks.json');
  fs.writeFileSync(tempFilePath, JSON.stringify(chunks.map(c => c.text)));
  
  // Create a Python script to generate embeddings
  const scriptPath = path.join(__dirname, 'generate_embeddings.py');
  const scriptContent = `
import sys
import json
import numpy as np
from sentence_transformers import SentenceTransformer

# Load the model
model = SentenceTransformer('${embeddingModel}')

# Load the chunks from the temp file
with open('${tempFilePath.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
    texts = json.load(f)

# Generate embeddings
embeddings = model.encode(texts)

# Save embeddings to a file
with open('${tempFilePath.replace(/\\/g, '\\\\')}.embeddings', 'w', encoding='utf-8') as f:
    json.dump(embeddings.tolist(), f)
  `;
  
  fs.writeFileSync(scriptPath, scriptContent);
  
  // Run the Python script
  return new Promise((resolve, reject) => {
    const python = spawn('python', [scriptPath]);
    
    python.stdout.on('data', (data) => {
      console.log(`Python stdout: ${data}`);
    });
    
    python.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        try {
          // Read the embeddings from the file
          const embeddingsJson = fs.readFileSync(`${tempFilePath}.embeddings`, 'utf8');
          const embeddings = JSON.parse(embeddingsJson);
          
          // Add embeddings to chunks
          const chunksWithEmbeddings = chunks.map((chunk, i) => ({
            ...chunk,
            embedding: embeddings[i]
          }));
          
          // Clean up temporary files
          fs.unlinkSync(tempFilePath);
          fs.unlinkSync(`${tempFilePath}.embeddings`);
          fs.unlinkSync(scriptPath);
          
          resolve(chunksWithEmbeddings);
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
  });
}

/**
 * Searches for similar chunks using cosine similarity
 * @param {string} query - The search query
 * @param {Array<{text: string, filePath: string, startPos: number, embedding: Array<number>}>} chunks - Chunks with embeddings
 * @param {string} modelName - Name of the sentence-transformer model to use
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array<{text: string, filePath: string, startPos: number, score: number}>>} - Search results
 */
async function searchChunks(query, chunks, modelName = 'all-MiniLM-L6-v2', topK = 5) {
  // For development, use a smaller model that loads faster
  const isDev = process.env.NODE_ENV === 'development';
  const embeddingModel = isDev ? 'paraphrase-MiniLM-L3-v2' : modelName;
  
  console.log(`Using search model: ${embeddingModel} (dev mode: ${isDev})`);
  
  // Create a temporary file to store the query
  const tempFilePath = path.join(__dirname, 'temp_query.json');
  fs.writeFileSync(tempFilePath, JSON.stringify([query]));
  
  // Create a temporary file to store the chunk embeddings
  const chunksEmbeddingsPath = path.join(__dirname, 'temp_chunks_embeddings.json');
  fs.writeFileSync(chunksEmbeddingsPath, JSON.stringify(chunks.map(c => c.embedding)));
  
  // Create a Python script to search for similar chunks
  const scriptPath = path.join(__dirname, 'search_chunks.py');
  const scriptContent = `
import sys
import json
import numpy as np
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity

# Load the model
model = SentenceTransformer('${embeddingModel}')

# Load the query from the temp file
with open('${tempFilePath.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
    query = json.load(f)[0]

# Generate query embedding
query_embedding = model.encode([query])[0]

# Load chunk embeddings
with open('${chunksEmbeddingsPath.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
    chunk_embeddings = json.load(f)

# Calculate cosine similarity
similarities = cosine_similarity([query_embedding], chunk_embeddings)[0]

# Get top-k results
top_indices = np.argsort(similarities)[::-1][:${topK}]
top_scores = similarities[top_indices]

# Save results to a file
results = [{"index": int(idx), "score": float(score)} for idx, score in zip(top_indices, top_scores)]
with open('${tempFilePath.replace(/\\/g, '\\\\')}.results', 'w', encoding='utf-8') as f:
    json.dump(results, f)
  `;
  
  fs.writeFileSync(scriptPath, scriptContent);
  
  // Run the Python script
  return new Promise((resolve, reject) => {
    const python = spawn('python', [scriptPath]);
    
    python.stdout.on('data', (data) => {
      console.log(`Python stdout: ${data}`);
    });
    
    python.stderr.on('data', (data) => {
      console.error(`Python stderr: ${data}`);
    });
    
    python.on('close', (code) => {
      if (code === 0) {
        try {
          // Read the results from the file
          const resultsJson = fs.readFileSync(`${tempFilePath}.results`, 'utf8');
          const results = JSON.parse(resultsJson);
          
          // Map results to chunks
          const searchResults = results.map(result => ({
            ...chunks[result.index],
            score: result.score
          }));
          
          // Clean up temporary files
          fs.unlinkSync(tempFilePath);
          fs.unlinkSync(`${tempFilePath}.results`);
          fs.unlinkSync(chunksEmbeddingsPath);
          fs.unlinkSync(scriptPath);
          
          resolve(searchResults);
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`Python process exited with code ${code}`));
      }
    });
  });
}

module.exports = {
  setupPythonEnvironment,
  scanDirectory,
  readTextFile,
  extractTextChunks,
  generateEmbeddings,
  searchChunks
}; 