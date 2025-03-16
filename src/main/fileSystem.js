const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { spawn } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

// Convert callback-based fs methods to Promise-based
const readFileAsync = promisify(fs.readFile);
const readdirAsync = promisify(fs.readdir);
const statAsync = promisify(fs.stat);

// Database setup
let db;
const dbPath = path.join(process.env.APPDATA || process.env.HOME || process.env.USERPROFILE, 'hereiam', 'hereiam.db');

/**
 * Initialize the SQLite database
 */
async function initDatabase() {
  // Ensure directory exists
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
  
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      
      // Create tables if they don't exist
      db.serialize(() => {
        // Documents table
        db.run(`CREATE TABLE IF NOT EXISTS documents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          path TEXT UNIQUE,
          title TEXT,
          last_indexed DATETIME
        )`);
        
        // Chunks table
        db.run(`CREATE TABLE IF NOT EXISTS chunks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          document_id INTEGER,
          text TEXT,
          start_position INTEGER,
          granularity TEXT,
          embedding_id INTEGER,
          FOREIGN KEY (document_id) REFERENCES documents(id)
        )`, (err) => {
          if (err) {
            console.error('Error creating tables:', err);
            reject(err);
          } else {
            console.log('Database initialized successfully');
            resolve();
          }
        });
      });
    });
  });
}

/**
 * Close the database connection
 */
function closeDatabase() {
  if (db) {
    db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

/**
 * Get or create a document record
 * @param {string} filePath - Path to the document
 * @returns {Promise<number>} - Document ID
 */
async function getOrCreateDocument(filePath) {
  return new Promise((resolve, reject) => {
    const title = path.basename(filePath);
    const now = new Date().toISOString();
    
    db.get('SELECT id FROM documents WHERE path = ?', [filePath], (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      
      if (row) {
        // Update last_indexed timestamp
        db.run('UPDATE documents SET last_indexed = ? WHERE id = ?', [now, row.id], (err) => {
          if (err) {
            reject(err);
          } else {
            resolve(row.id);
          }
        });
      } else {
        // Insert new document
        db.run('INSERT INTO documents (path, title, last_indexed) VALUES (?, ?, ?)', 
          [filePath, title, now], 
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve(this.lastID);
            }
          }
        );
      }
    });
  });
}

/**
 * Store chunks in the database
 * @param {Array<{text: string, filePath: string, startPos: number, granularity: string, embedding: Array<number>}>} chunks - Chunks with embeddings
 * @returns {Promise<Array<{id: number, text: string, filePath: string, startPos: number, granularity: string, embedding: Array<number>}>>} - Chunks with IDs
 */
async function storeChunks(chunks) {
  // Group chunks by file path
  const chunksByFile = {};
  for (const chunk of chunks) {
    if (!chunksByFile[chunk.filePath]) {
      chunksByFile[chunk.filePath] = [];
    }
    chunksByFile[chunk.filePath].push(chunk);
  }
  
  const chunksWithIds = [];
  
  // Process each file's chunks
  for (const filePath of Object.keys(chunksByFile)) {
    const documentId = await getOrCreateDocument(filePath);
    const fileChunks = chunksByFile[filePath];
    
    // Clear existing chunks for this document
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM chunks WHERE document_id = ?', [documentId], (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
    
    // Insert new chunks
    for (let i = 0; i < fileChunks.length; i++) {
      const chunk = fileChunks[i];
      const embeddingId = i; // This will match the position in the FAISS index
      
      const chunkWithId = await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO chunks (document_id, text, start_position, granularity, embedding_id) VALUES (?, ?, ?, ?, ?)',
          [documentId, chunk.text, chunk.startPos, chunk.granularity, embeddingId],
          function(err) {
            if (err) {
              reject(err);
            } else {
              resolve({
                ...chunk,
                id: this.lastID,
                embeddingId
              });
            }
          }
        );
      });
      
      chunksWithIds.push(chunkWithId);
    }
  }
  
  return chunksWithIds;
}

/**
 * Get chunks by embedding IDs
 * @param {Array<number>} embeddingIds - Array of embedding IDs
 * @returns {Promise<Array<{id: number, text: string, filePath: string, startPos: number, granularity: string, embeddingId: number}>>} - Chunks
 */
async function getChunksByEmbeddingIds(embeddingIds) {
  if (embeddingIds.length === 0) return [];
  
  const placeholders = embeddingIds.map(() => '?').join(',');
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.id, c.text, c.start_position, c.granularity, c.embedding_id, d.path 
       FROM chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.embedding_id IN (${placeholders})`,
      embeddingIds,
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const chunks = rows.map(row => ({
            id: row.id,
            text: row.text,
            filePath: row.path,
            startPos: row.start_position,
            granularity: row.granularity,
            embeddingId: row.embedding_id
          }));
          
          // Sort chunks to match the order of embeddingIds
          chunks.sort((a, b) => {
            return embeddingIds.indexOf(a.embeddingId) - embeddingIds.indexOf(b.embeddingId);
          });
          
          resolve(chunks);
        }
      }
    );
  });
}

/**
 * Get chunks by granularity levels
 * @param {Object} granularityLevels - Object with granularity levels as keys and boolean values
 * @returns {Promise<Array<{id: number, text: string, filePath: string, startPos: number, granularity: string, embeddingId: number}>>} - Chunks
 */
async function getChunksByGranularity(granularityLevels) {
  const levels = Object.entries(granularityLevels)
    .filter(([_, value]) => value)
    .map(([key, _]) => key);
  
  if (levels.length === 0) return [];
  
  const placeholders = levels.map(() => '?').join(',');
  
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.id, c.text, c.start_position, c.granularity, c.embedding_id, d.path 
       FROM chunks c
       JOIN documents d ON c.document_id = d.id
       WHERE c.granularity IN (${placeholders})`,
      levels,
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          const chunks = rows.map(row => ({
            id: row.id,
            text: row.text,
            filePath: row.path,
            startPos: row.start_position,
            granularity: row.granularity,
            embeddingId: row.embedding_id
          }));
          resolve(chunks);
        }
      }
    );
  });
}

/**
 * Check if Python is installed and install required packages if needed
 */
async function setupPythonEnvironment() {
  return new Promise((resolve, reject) => {
    const pip = spawn('pip', ['install', 'sentence-transformers', 'numpy', 'scikit-learn', 'faiss-cpu', '--user']);
    
    pip.stdout.on('data', (data) => {
      console.log(`pip stdout: ${data}`);
    });
    
    pip.stderr.on('data', (data) => {
      console.error(`pip stderr: ${data}`);
    });
    
    pip.on('close', (code) => {
      if (code === 0) {
        console.log('Python dependencies installed successfully');
        
        // Initialize database after Python setup
        initDatabase()
          .then(() => resolve(true))
          .catch(err => reject(err));
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
 * @param {number} chunkSize - Maximum size of each chunk in characters (0 for entire document)
 * @param {string} granularity - Granularity level ('paragraph', 'page', 'document')
 * @returns {Promise<Array<{text: string, filePath: string, startPos: number, granularity: string}>>} - Array of text chunks
 */
async function extractTextChunks(filePath, chunkSize = 1000, granularity = 'paragraph') {
  // If granularity is document, use the entire file as one chunk
  if (granularity === 'document') {
    const content = await readTextFile(filePath);
    return [{
      text: content,
      filePath,
      startPos: 0,
      granularity: 'document'
    }];
  }
  
  // Use the specified chunk size without any dev mode modifications
  const content = await readTextFile(filePath);
  const textChunks = chunkText(content, chunkSize);
  
  const chunks = [];
  let startPos = 0;
  
  for (const text of textChunks) {
    chunks.push({
      text,
      filePath,
      startPos,
      granularity
    });
    
    // Update the start position for the next chunk
    startPos += text.length;
  }
  
  console.log(`Extracted ${chunks.length} ${granularity} chunks from ${filePath}`);
  
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

# Normalize embeddings for cosine similarity
embeddings = embeddings / np.linalg.norm(embeddings, axis=1, keepdims=True)

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
 * Searches for similar chunks using a persistent FAISS index
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
  
  // Path for the FAISS index
  const indexPath = path.join(__dirname, 'faiss_index.bin');
  
  // Check if FAISS index exists, if not create it
  if (!fs.existsSync(indexPath)) {
    console.log('FAISS index not found, creating it...');
    await createFaissIndex(chunks);
  }
  
  // Create a temporary file to store the query
  const tempFilePath = path.join(__dirname, 'temp_query.json');
  fs.writeFileSync(tempFilePath, JSON.stringify([query]));
  
  // Create a Python script to search using the persistent FAISS index
  const scriptPath = path.join(__dirname, 'search_faiss_index.py');
  const scriptContent = `
import sys
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer

# Load the model
model = SentenceTransformer('${embeddingModel}')

# Load the query from the temp file
with open('${tempFilePath.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
    query = json.load(f)[0]

# Generate query embedding
query_embedding = model.encode([query])[0]

# Normalize query embedding for cosine similarity
query_embedding = query_embedding / np.linalg.norm(query_embedding)

# Load the FAISS index
index = faiss.read_index('${indexPath.replace(/\\/g, '\\\\')}')

# Search the index
k = min(${topK}, index.ntotal)  # Make sure k is not larger than the number of vectors
distances, indices = index.search(np.array([query_embedding]).astype('float32'), k)

# Format results
results = [{"index": int(idx), "score": float(score)} for idx, score in zip(indices[0], distances[0])]

# Save results to a file
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
          
          // Get embedding IDs from results
          const embeddingIds = results.map(result => result.index);
          
          // Get chunks from database by embedding IDs
          getChunksByEmbeddingIds(embeddingIds)
            .then(dbChunks => {
              // Map results to chunks from database
              const searchResults = results.map((result, i) => {
                const chunk = dbChunks.find(c => c.embeddingId === result.index) || chunks[result.index];
                return {
                  ...chunk,
                  score: result.score
                };
              });
              
              // Clean up temporary files
              fs.unlinkSync(tempFilePath);
              fs.unlinkSync(`${tempFilePath}.results`);
              fs.unlinkSync(scriptPath);
              
              resolve(searchResults);
            })
            .catch(error => {
              // Fallback to using in-memory chunks if database query fails
              console.error('Error getting chunks from database:', error);
              const searchResults = results.map(result => ({
                ...chunks[result.index],
                score: result.score
              }));
              
              // Clean up temporary files
              fs.unlinkSync(tempFilePath);
              fs.unlinkSync(`${tempFilePath}.results`);
              fs.unlinkSync(scriptPath);
              
              resolve(searchResults);
            });
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
 * Creates a persistent FAISS index from embeddings
 * @param {Array<{text: string, filePath: string, startPos: number, embedding: Array<number>}>} chunks - Chunks with embeddings
 * @returns {Promise<boolean>} - Success status
 */
async function createFaissIndex(chunks) {
  // First store chunks in the database
  try {
    const chunksWithIds = await storeChunks(chunks);
    console.log(`Stored ${chunksWithIds.length} chunks in the database`);
  } catch (error) {
    console.error('Error storing chunks in database:', error);
    // Continue with FAISS index creation even if database storage fails
  }
  
  // Create a temporary file to store the chunk embeddings
  const chunksEmbeddingsPath = path.join(__dirname, 'temp_chunks_embeddings.json');
  fs.writeFileSync(chunksEmbeddingsPath, JSON.stringify(chunks.map(c => c.embedding)));
  
  // Path for the FAISS index
  const indexPath = path.join(__dirname, 'faiss_index.bin');
  
  // Create a Python script to build the FAISS index
  const scriptPath = path.join(__dirname, 'create_faiss_index.py');
  const scriptContent = `
import sys
import json
import numpy as np
import faiss
import os

# Load chunk embeddings
with open('${chunksEmbeddingsPath.replace(/\\/g, '\\\\')}', 'r', encoding='utf-8') as f:
    chunk_embeddings = json.load(f)

# Convert to numpy array
chunk_embeddings = np.array(chunk_embeddings).astype('float32')

# Build FAISS index - using IndexFlatIP for inner product (cosine similarity with normalized vectors)
dimension = chunk_embeddings.shape[1]  # Get the dimension of the embeddings
index = faiss.IndexFlatIP(dimension)   # Inner product is equivalent to cosine similarity when vectors are normalized
index.add(chunk_embeddings)            # Add vectors to the index

# Save the index to disk
faiss.write_index(index, '${indexPath.replace(/\\/g, '\\\\')}')

# Clean up
os.remove('${chunksEmbeddingsPath.replace(/\\/g, '\\\\')}')

print(f"FAISS index created with {len(chunk_embeddings)} vectors of dimension {dimension}")
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
          // Clean up temporary files
          fs.unlinkSync(scriptPath);
          
          console.log('FAISS index created successfully');
          resolve(true);
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
  searchChunks,
  createFaissIndex,
  initDatabase,
  closeDatabase,
  storeChunks,
  getChunksByEmbeddingIds,
  getChunksByGranularity
}; 