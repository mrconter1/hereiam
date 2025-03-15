const { app, BrowserWindow } = require('electron');

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600
  });

  // Create a simple HTML content
  win.loadURL(`data:text/html,
    <html>
      <head>
        <title>Simple Electron App</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; }
          h1 { color: #4a6fa5; }
        </style>
      </head>
      <body>
        <h1>Hello from Electron!</h1>
        <p>This is a simple test to verify Electron is working correctly.</p>
      </body>
    </html>
  `);
}

app.whenReady().then(createWindow); 