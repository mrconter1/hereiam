const fs = require('fs');
const path = require('path');

// Create dist directory if it doesn't exist
const distDir = path.join(__dirname, 'dist');
const mainDir = path.join(distDir, 'main');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir);
}

if (!fs.existsSync(mainDir)) {
  fs.mkdirSync(mainDir);
}

// Copy main process files
const mainFiles = ['index.js', 'preload.js'];
mainFiles.forEach(file => {
  const srcPath = path.join(__dirname, 'src', 'main', file);
  const destPath = path.join(mainDir, file);
  
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, destPath);
    console.log(`Copied ${file} to dist/main/`);
  } else {
    console.error(`Source file ${srcPath} does not exist`);
  }
});

console.log('Main process files built successfully!'); 