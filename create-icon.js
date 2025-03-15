const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Create a 512x512 icon
const size = 512;
const canvas = createCanvas(size, size);
const ctx = canvas.getContext('2d');

// Background
ctx.fillStyle = '#4a6fa5';
ctx.beginPath();
ctx.roundRect(0, 0, size, size, 64);
ctx.fill();

// White circle
ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
ctx.beginPath();
ctx.arc(size/2, size/2, size/4, 0, Math.PI * 2);
ctx.fill();

// Diamond shape
ctx.fillStyle = '#4fc3f7';
ctx.beginPath();
ctx.moveTo(size/2, size/2 - size/6);
ctx.lineTo(size/2 + size/6, size/2);
ctx.lineTo(size/2, size/2 + size/6);
ctx.lineTo(size/2 - size/6, size/2);
ctx.closePath();
ctx.fill();

// Center circle
ctx.fillStyle = '#4a6fa5';
ctx.beginPath();
ctx.arc(size/2, size/2, size/10, 0, Math.PI * 2);
ctx.fill();

// Save the icon
const buffer = canvas.toBuffer('image/png');
const iconPath = path.join(__dirname, 'assets', 'icon.png');

fs.writeFileSync(iconPath, buffer);
console.log(`Icon created at ${iconPath}`); 