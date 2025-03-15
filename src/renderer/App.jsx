import React, { useState } from 'react';
import styled from '@emotion/styled';

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 20px;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
`;

const Title = styled.h1`
  font-size: 24px;
  color: var(--primary-color);
`;

const MainContent = styled.main`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  padding: 40px;
  overflow: auto;
`;

const WelcomeMessage = styled.div`
  text-align: center;
  max-width: 600px;
  margin-bottom: 30px;
`;

const Button = styled.button`
  padding: 12px 24px;
  font-size: 16px;
  background-color: var(--primary-color);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;

  &:hover {
    background-color: var(--secondary-color);
  }

  &:disabled {
    background-color: var(--dark-gray);
    cursor: not-allowed;
  }
`;

const FolderPath = styled.div`
  margin-top: 20px;
  padding: 10px;
  background-color: var(--background-color);
  border-radius: 4px;
  font-family: monospace;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const FileList = styled.div`
  margin-top: 20px;
  width: 100%;
  max-width: 800px;
  text-align: left;
`;

const FileItem = styled.div`
  padding: 8px;
  margin-bottom: 4px;
  background-color: var(--background-color);
  border-radius: 4px;
  cursor: pointer;
  
  &:hover {
    background-color: var(--light-gray);
  }
`;

const FileContent = styled.div`
  margin-top: 20px;
  padding: 16px;
  background-color: var(--background-color);
  border-radius: 4px;
  width: 100%;
  max-width: 800px;
  max-height: 400px;
  overflow: auto;
  white-space: pre-wrap;
  font-family: monospace;
`;

const ProgressBar = styled.div`
  width: 100%;
  max-width: 800px;
  height: 8px;
  background-color: var(--light-gray);
  border-radius: 4px;
  margin-top: 20px;
  overflow: hidden;
`;

const ProgressFill = styled.div`
  height: 100%;
  background-color: var(--accent-color);
  width: ${props => props.progress}%;
  transition: width 0.3s ease;
`;

const StatusMessage = styled.div`
  margin-top: 10px;
  color: var(--dark-gray);
`;

function App() {
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  const handleSelectFolder = async () => {
    try {
      // Check if we're in Electron environment
      if (window.electron) {
        const result = await window.electron.selectDirectory();
        
        if (!result.canceled && result.filePaths.length > 0) {
          const folderPath = result.filePaths[0];
          setSelectedFolder(folderPath);
          setFiles([]);
          setSelectedFile(null);
          setFileContent('');
          
          // Start scanning the directory
          await scanDirectory(folderPath);
        }
      } else {
        console.log('Not running in Electron');
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setStatusMessage('Error selecting folder: ' + error.message);
    }
  };

  const scanDirectory = async (folderPath) => {
    try {
      setIsScanning(true);
      setProgress(0);
      setStatusMessage('Scanning directory...');
      
      const result = await window.electron.scanDirectory(folderPath);
      
      if (result.success) {
        setFiles(result.files);
        setStatusMessage(`Found ${result.files.length} files`);
      } else {
        setStatusMessage('Error scanning directory: ' + result.error);
      }
      
      setProgress(100);
      setIsScanning(false);
    } catch (error) {
      console.error('Error scanning directory:', error);
      setStatusMessage('Error scanning directory: ' + error.message);
      setIsScanning(false);
    }
  };

  const handleFileClick = async (filePath) => {
    try {
      setSelectedFile(filePath);
      setStatusMessage('Loading file...');
      
      const result = await window.electron.readFile(filePath);
      
      if (result.success) {
        setFileContent(result.content);
        setStatusMessage('File loaded successfully');
      } else {
        setFileContent('');
        setStatusMessage('Error reading file: ' + result.error);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      setStatusMessage('Error reading file: ' + error.message);
    }
  };

  return (
    <Container>
      <Header>
        <Title>HereIAm</Title>
      </Header>
      
      <MainContent>
        {!selectedFolder ? (
          <>
            <WelcomeMessage>
              <h2>Welcome to HereIAm</h2>
              <p>Select a folder to index your documents and start searching through them with natural language queries.</p>
            </WelcomeMessage>
            
            <Button onClick={handleSelectFolder} disabled={isScanning}>
              Select Folder
            </Button>
          </>
        ) : (
          <>
            <FolderPath>
              Selected folder: {selectedFolder}
            </FolderPath>
            
            <Button onClick={handleSelectFolder} disabled={isScanning} style={{ marginTop: '10px' }}>
              Change Folder
            </Button>
            
            {isScanning && (
              <ProgressBar>
                <ProgressFill progress={progress} />
              </ProgressBar>
            )}
            
            {statusMessage && (
              <StatusMessage>{statusMessage}</StatusMessage>
            )}
            
            {files.length > 0 && (
              <FileList>
                <h3>Files ({files.length})</h3>
                {files.slice(0, 10).map((file, index) => (
                  <FileItem key={index} onClick={() => handleFileClick(file)}>
                    {file.split(/[\\/]/).pop()} {/* Display just the filename */}
                  </FileItem>
                ))}
                {files.length > 10 && (
                  <StatusMessage>Showing 10 of {files.length} files</StatusMessage>
                )}
              </FileList>
            )}
            
            {selectedFile && fileContent && (
              <FileContent>
                {fileContent.length > 1000 
                  ? fileContent.substring(0, 1000) + '...' 
                  : fileContent}
              </FileContent>
            )}
          </>
        )}
      </MainContent>
    </Container>
  );
}

export default App; 