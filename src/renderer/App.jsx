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
  TextField,
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

const SearchResult = styled(Paper)`
  padding: 16px;
  margin-bottom: 16px;
  border-left: 4px solid ${props => props.theme.palette.primary.main};
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

const SearchResultPath = styled(Typography)`
  font-size: 12px;
  color: ${props => props.theme.palette.text.secondary};
  margin-bottom: 8px;
`;

const SearchResultScore = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: ${props => props.theme.palette.primary.main};
  color: white;
  font-size: 12px;
  margin-left: 8px;
`;

// Setup steps
const steps = [
  'Select Folder',
  'Index Documents',
  'Search Documents'
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [indexingDetails, setIndexingDetails] = useState({
    currentFile: '',
    processedFiles: 0,
    totalFiles: 0,
    totalFilesFound: 0
  });

  // Check if running in Electron on component mount
  useEffect(() => {
    // Check if the electron object is available in window
    setIsElectron(!!window.electron);
    
    // Set up event listener for folder selection from the menu
    if (window.electron) {
      window.electron.onFolderSelected((folderPath) => {
        handleFolderSelected(folderPath);
      });
      
      window.electron.onIndexingProgress((progress) => {
        setProgress(progress.progress);
        setIndexingDetails({
          currentFile: progress.currentFile,
          processedFiles: progress.processedFiles,
          totalFiles: progress.totalFiles,
          totalFilesFound: progress.totalFilesFound || progress.totalFiles
        });
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
      
      const result = await window.electron.scanDirectory(selectedFolder);
      
      if (result.success) {
        setFiles(result.files);
        const totalFilesMessage = result.totalFilesFound > result.files.length 
          ? ` (limited from ${result.totalFilesFound} total files found)` 
          : '';
        setStatusMessage(`Found ${result.files.length} files${totalFilesMessage} and created ${result.chunksCount} chunks`);
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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    try {
      setIsSearching(true);
      setStatusMessage('Searching...');
      setError(null);
      
      const result = await window.electron.search(searchQuery);
      
      if (result.success) {
        setSearchResults(result.results);
        setStatusMessage(`Found ${result.results.length} results for "${searchQuery}"`);
      } else {
        setSearchResults([]);
        setError('Error searching: ' + result.error);
        setStatusMessage('Error searching: ' + result.error);
      }
      
      setIsSearching(false);
    } catch (error) {
      console.error('Error searching:', error);
      setError(`Error searching: ${error.message}`);
      setStatusMessage('Error searching: ' + error.message);
      setIsSearching(false);
    }
  };

  const handleSearchResultClick = async (result) => {
    try {
      setSelectedFile(result.filePath);
      setStatusMessage('Loading file...');
      setError(null);
      
      const fileResult = await window.electron.readFile(result.filePath);
      
      if (fileResult.success) {
        setFileContent(fileResult.content);
        
        // Scroll to the relevant part of the file
        setTimeout(() => {
          const fileContentElement = document.getElementById('file-content');
          if (fileContentElement) {
            // Create a temporary element to measure text height
            const tempElement = document.createElement('div');
            tempElement.style.fontFamily = 'monospace';
            tempElement.style.fontSize = '14px';
            tempElement.style.position = 'absolute';
            tempElement.style.visibility = 'hidden';
            tempElement.style.whiteSpace = 'pre-wrap';
            tempElement.style.width = fileContentElement.clientWidth + 'px';
            tempElement.textContent = fileResult.content.substring(0, result.startPos);
            document.body.appendChild(tempElement);
            
            // Calculate scroll position
            const scrollPosition = tempElement.clientHeight;
            fileContentElement.scrollTop = scrollPosition;
            
            // Clean up
            document.body.removeChild(tempElement);
          }
        }, 100);
        
        setStatusMessage('File loaded successfully');
      } else {
        setFileContent('');
        setError('Error reading file: ' + fileResult.error);
        setStatusMessage('Error reading file: ' + fileResult.error);
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
    setSearchQuery('');
    setSearchResults([]);
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
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Processing file {indexingDetails.processedFiles} of {indexingDetails.totalFiles}
                  {indexingDetails.totalFilesFound > indexingDetails.totalFiles && 
                    ` (limited from ${indexingDetails.totalFilesFound} total files)`}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5 }} noWrap>
                  {indexingDetails.currentFile}
                </Typography>
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
                Step 3: Search Documents
              </Typography>
              <Typography variant="body1" paragraph>
                Indexing complete! You can now search through your documents using natural language.
              </Typography>
              <Typography variant="body2" paragraph>
                Indexed {files.length} files from {selectedFolder}
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                <TextField
                  fullWidth
                  label="Search Query"
                  variant="outlined"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter a natural language query like 'Story about a dog and a boy'"
                />
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={isSearching ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                  onClick={handleSearch}
                  disabled={isSearching || !searchQuery.trim()}
                >
                  Search
                </Button>
              </Box>
              
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button 
                  variant="outlined" 
                  startIcon={<ArrowBackIcon />}
                  onClick={resetSetup}
                >
                  Start Over
                </Button>
              </Box>
            </StyledPaper>
            
            {searchResults.length > 0 && (
              <StyledPaper elevation={3}>
                <Typography variant="h6" gutterBottom>
                  Search Results
                </Typography>
                <Divider sx={{ mb: 2 }} />
                
                {searchResults.map((result, index) => (
                  <SearchResult 
                    key={index} 
                    elevation={1} 
                    onClick={() => handleSearchResultClick(result)}
                    theme={theme}
                  >
                    <SearchResultPath theme={theme}>
                      {result.filePath}
                      <SearchResultScore theme={theme}>
                        {Math.round(result.score * 100)}%
                      </SearchResultScore>
                    </SearchResultPath>
                    <Typography variant="body1">
                      {result.text.length > 300 
                        ? result.text.substring(0, 300) + '...' 
                        : result.text}
                    </Typography>
                  </SearchResult>
                ))}
              </StyledPaper>
            )}
            
            {selectedFile && (
              <Card sx={{ maxHeight: 600, overflow: 'auto', mt: 2 }}>
                <Box sx={{ p: 2 }}>
                  <Typography variant="subtitle1" noWrap>
                    {selectedFile.split(/[\\/]/).pop()}
                  </Typography>
                  <Divider sx={{ my: 1 }} />
                  {fileContent ? (
                    <FileContent id="file-content">
                      {fileContent.length > 10000 
                        ? fileContent.substring(0, 10000) + '...' 
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