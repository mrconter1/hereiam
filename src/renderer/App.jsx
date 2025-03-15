import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import {
  AppBar,
  Box,
  Button,
  Card,
  CircularProgress,
  Container,
  Divider,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Step,
  StepLabel,
  Stepper,
  Toolbar,
  Typography,
  useTheme
} from '@mui/material';
import {
  Folder as FolderIcon,
  Search as SearchIcon,
  Settings as SettingsIcon,
  ArrowBack as ArrowBackIcon,
  Description as DescriptionIcon
} from '@mui/icons-material';

const AppContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background-color: var(--background-color);
`;

const MainContent = styled.main`
  flex: 1;
  padding: 24px;
  overflow: auto;
`;

const StyledPaper = styled(Paper)`
  padding: 24px;
  margin-bottom: 24px;
`;

const FileContent = styled.pre`
  white-space: pre-wrap;
  font-family: monospace;
  font-size: 14px;
  padding: 16px;
  background-color: #f5f5f5;
  border-radius: 4px;
  overflow: auto;
  max-height: 400px;
`;

const StatusText = styled(Typography)`
  margin-top: 16px;
  color: ${props => props.color || 'inherit'};
`;

// Setup steps
const steps = [
  'Select Folder',
  'Index Documents',
  'Ready to Search'
];

function App() {
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState('');
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState(null);
  const [isElectron, setIsElectron] = useState(false);

  // Check if running in Electron on component mount
  useEffect(() => {
    // Check if the electron object is available in window
    setIsElectron(!!window.electron);
    
    // Set up event listener for folder selection from the menu
    if (window.electron) {
      window.electron.onFolderSelected((folderPath) => {
        handleFolderSelected(folderPath);
      });
    }
    
    // Clean up event listeners when component unmounts
    return () => {
      if (window.electron) {
        window.electron.removeAllListeners();
      }
    };
  }, []);

  const handleFolderSelected = (folderPath) => {
    setSelectedFolder(folderPath);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setStatusMessage(`Selected folder: ${folderPath}`);
    setActiveStep(1); // Move to next step
  };

  const handleSelectFolder = async () => {
    try {
      setError(null);
      // Check if we're in Electron environment
      if (isElectron) {
        const result = await window.electron.selectDirectory();
        
        if (!result.canceled && result.filePaths.length > 0) {
          handleFolderSelected(result.filePaths[0]);
        }
      } else {
        console.log('Not running in Electron');
        setError('Not running in Electron environment. This feature requires the desktop application.');
      }
    } catch (error) {
      console.error('Error selecting folder:', error);
      setError(`Error selecting folder: ${error.message}`);
      setStatusMessage('Error selecting folder: ' + error.message);
    }
  };

  const scanDirectory = async () => {
    if (!selectedFolder) return;
    
    try {
      setIsScanning(true);
      setProgress(0);
      setStatusMessage('Scanning directory...');
      setError(null);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          const newProgress = prev + 5;
          return newProgress > 90 ? 90 : newProgress;
        });
      }, 200);
      
      const result = await window.electron.scanDirectory(selectedFolder);
      
      clearInterval(progressInterval);
      
      if (result.success) {
        setFiles(result.files);
        setStatusMessage(`Found ${result.files.length} files`);
        setProgress(100);
        setActiveStep(2); // Move to final step
      } else {
        setError('Error scanning directory: ' + result.error);
        setStatusMessage('Error scanning directory: ' + result.error);
      }
      
      setIsScanning(false);
    } catch (error) {
      console.error('Error scanning directory:', error);
      setError(`Error scanning directory: ${error.message}`);
      setStatusMessage('Error scanning directory: ' + error.message);
      setIsScanning(false);
    }
  };

  const handleFileClick = async (filePath) => {
    try {
      setSelectedFile(filePath);
      setStatusMessage('Loading file...');
      setError(null);
      
      const result = await window.electron.readFile(filePath);
      
      if (result.success) {
        setFileContent(result.content);
        setStatusMessage('File loaded successfully');
      } else {
        setFileContent('');
        setError('Error reading file: ' + result.error);
        setStatusMessage('Error reading file: ' + result.error);
      }
    } catch (error) {
      console.error('Error reading file:', error);
      setError(`Error reading file: ${error.message}`);
      setStatusMessage('Error reading file: ' + error.message);
    }
  };

  const resetSetup = () => {
    setActiveStep(0);
    setSelectedFolder(null);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setStatusMessage('');
    setError(null);
  };

  // Render different content based on the active step
  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <StyledPaper elevation={3}>
            <Typography variant="h5" gutterBottom>
              Step 1: Select a Folder
            </Typography>
            <Typography variant="body1" paragraph>
              Choose a folder containing the documents you want to index and search through.
            </Typography>
            <Button 
              variant="contained" 
              color="primary" 
              startIcon={<FolderIcon />}
              onClick={handleSelectFolder}
              size="large"
              disabled={!isElectron}
            >
              Select Folder
            </Button>
            <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
              You can also use the keyboard shortcut Ctrl+O or select File → Open Folder from the menu.
            </Typography>
            {!isElectron && (
              <StatusText color="warning.main" variant="body2" sx={{ mt: 2 }}>
                Note: You are running in browser mode. To use folder selection, please run the desktop application.
              </StatusText>
            )}
            {error && (
              <StatusText color="error.main" variant="body2">
                {error}
              </StatusText>
            )}
          </StyledPaper>
        );
      
      case 1:
        return (
          <StyledPaper elevation={3}>
            <Typography variant="h5" gutterBottom>
              Step 2: Index Documents
            </Typography>
            <Typography variant="body1" paragraph>
              Selected folder: <strong>{selectedFolder}</strong>
            </Typography>
            <Typography variant="body1" paragraph>
              Click the button below to scan and index all documents in the selected folder.
            </Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button 
                variant="outlined" 
                startIcon={<ArrowBackIcon />}
                onClick={resetSetup}
              >
                Back
              </Button>
              <Button 
                variant="contained" 
                color="primary" 
                startIcon={isScanning ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                onClick={scanDirectory}
                disabled={isScanning || !isElectron}
              >
                {isScanning ? 'Indexing...' : 'Start Indexing'}
              </Button>
            </Box>
            {isScanning && (
              <Box sx={{ width: '100%', mt: 2 }}>
                <LinearProgress variant="determinate" value={progress} />
              </Box>
            )}
            {statusMessage && (
              <StatusText variant="body2">
                {statusMessage}
              </StatusText>
            )}
            {error && (
              <StatusText color="error.main" variant="body2">
                {error}
              </StatusText>
            )}
          </StyledPaper>
        );
      
      case 2:
        return (
          <>
            <StyledPaper elevation={3}>
              <Typography variant="h5" gutterBottom>
                Step 3: Ready to Search
              </Typography>
              <Typography variant="body1" paragraph>
                Indexing complete! You can now browse and search through your documents.
              </Typography>
              <Typography variant="body2" paragraph>
                Found {files.length} files in {selectedFolder}
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<ArrowBackIcon />}
                  onClick={resetSetup}
                >
                  Start Over
                </Button>
                <Button 
                  variant="contained" 
                  color="primary" 
                  startIcon={<SearchIcon />}
                  disabled={files.length === 0}
                >
                  Search Documents
                </Button>
              </Box>
            </StyledPaper>
            
            <Box sx={{ display: 'flex', gap: 3 }}>
              <Card sx={{ width: 320, maxHeight: 600, overflow: 'auto' }}>
                <List subheader={
                  <Box sx={{ p: 2, pb: 0 }}>
                    <Typography variant="h6">Files ({files.length})</Typography>
                    <Divider />
                  </Box>
                }>
                  {files.slice(0, 100).map((file, index) => (
                    <ListItem key={index} disablePadding>
                      <ListItemButton onClick={() => handleFileClick(file)}>
                        <DescriptionIcon sx={{ mr: 1, color: 'primary.light' }} />
                        <ListItemText 
                          primary={file.split(/[\\/]/).pop()} 
                          primaryTypographyProps={{ 
                            noWrap: true,
                            style: { maxWidth: '220px' }
                          }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                  {files.length > 100 && (
                    <ListItem>
                      <ListItemText 
                        secondary={`Showing 100 of ${files.length} files`} 
                        secondaryTypographyProps={{ align: 'center' }}
                      />
                    </ListItem>
                  )}
                </List>
              </Card>
              
              {selectedFile && (
                <Card sx={{ flex: 1, maxHeight: 600, overflow: 'auto' }}>
                  <Box sx={{ p: 2 }}>
                    <Typography variant="subtitle1" noWrap>
                      {selectedFile.split(/[\\/]/).pop()}
                    </Typography>
                    <Divider sx={{ my: 1 }} />
                    {fileContent ? (
                      <FileContent>
                        {fileContent.length > 5000 
                          ? fileContent.substring(0, 5000) + '...' 
                          : fileContent}
                      </FileContent>
                    ) : (
                      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                        <CircularProgress />
                      </Box>
                    )}
                  </Box>
                </Card>
              )}
            </Box>
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <AppContainer>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            HereIAm
          </Typography>
          <IconButton color="inherit" size="large">
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      
      <MainContent>
        <Container maxWidth="lg">
          <Box sx={{ mb: 4 }}>
            <Stepper activeStep={activeStep}>
              {steps.map((label) => (
                <Step key={label}>
                  <StepLabel>{label}</StepLabel>
                </Step>
              ))}
            </Stepper>
          </Box>
          
          {renderStepContent()}
        </Container>
      </MainContent>
    </AppContainer>
  );
}

export default App; 