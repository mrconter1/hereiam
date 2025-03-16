import React, { useState, useEffect } from 'react';
import styled from '@emotion/styled';
import {
  AppBar,
  Box,
  Button,
  Card,
  Checkbox,
  CircularProgress,
  Container,
  Divider,
  FormControlLabel,
  FormGroup,
  IconButton,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Paper,
  Drawer,
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
  Description as DescriptionIcon,
  Refresh as RefreshIcon,
  Close as CloseIcon
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

const GranularityBadge = styled.span`
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: ${props => props.theme.palette.secondary.main};
  color: white;
  font-size: 12px;
  margin-left: 8px;
  text-transform: capitalize;
`;

const SearchBox = styled(Box)`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
`;

function App() {
  const theme = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const [hasIndexedData, setHasIndexedData] = useState(false);
  const [needsInitialSetup, setNeedsInitialSetup] = useState(true);
  const [granularityLevels, setGranularityLevels] = useState({
    paragraph: true,
    page: false,
    document: false
  });
  const [indexingGranularityLevels, setIndexingGranularityLevels] = useState({
    paragraph: true,
    page: false,
    document: false
  });
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

      // Check if we have indexed data
      checkForIndexedData();
    }
    
    // Clean up event listeners when component unmounts
    return () => {
      if (window.electron) {
        window.electron.removeAllListeners();
      }
    };
  }, []);

  // Check if we have indexed data
  const checkForIndexedData = async () => {
    try {
      const result = await window.electron.checkIndexedData();
      if (result.success) {
        setHasIndexedData(result.hasData);
        setSelectedFolder(result.folderPath || null);
        setNeedsInitialSetup(!result.hasData);
        
        if (result.hasData) {
          setStatusMessage(`Loaded ${result.chunksCount} indexed chunks from ${result.folderPath}`);
        }
      }
    } catch (error) {
      console.error('Error checking indexed data:', error);
    }
  };

  const handleFolderSelected = (folderPath) => {
    setSelectedFolder(folderPath);
    setFiles([]);
    setSelectedFile(null);
    setFileContent('');
    setStatusMessage(`Selected folder: ${folderPath}`);
    
    // If we're in settings, don't start indexing automatically
    if (!settingsOpen) {
      scanDirectory(folderPath);
    }
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

  const scanDirectory = async (folderToScan = selectedFolder) => {
    if (!folderToScan) return;
    
    // Ensure at least one granularity level is selected
    if (!indexingGranularityLevels.paragraph && 
        !indexingGranularityLevels.page && 
        !indexingGranularityLevels.document) {
      setError('Please select at least one granularity level for indexing');
      return;
    }
    
    try {
      setIsScanning(true);
      setProgress(0);
      setStatusMessage('Scanning directory...');
      setError(null);
      
      const result = await window.electron.scanDirectory(folderToScan, undefined, indexingGranularityLevels);
      
      if (result.success) {
        setFiles(result.files);
        const totalFilesMessage = result.totalFilesFound > result.files.length 
          ? ` (limited from ${result.totalFilesFound} total files found)` 
          : '';
        setStatusMessage(`Found ${result.files.length} files${totalFilesMessage} and created ${result.chunksCount} chunks`);
        setProgress(100);
        setHasIndexedData(true);
        setNeedsInitialSetup(false);
        
        // Close settings drawer if open
        setSettingsOpen(false);
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
    
    // Ensure at least one granularity level is selected
    if (!granularityLevels.paragraph && !granularityLevels.page && !granularityLevels.document) {
      setError('Please select at least one granularity level for search');
      return;
    }
    
    try {
      setIsSearching(true);
      setStatusMessage('Searching...');
      setError(null);
      
      const result = await window.electron.search(searchQuery, granularityLevels);
      
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

  const toggleSettings = () => {
    setSettingsOpen(!settingsOpen);
  };

  // Render the initial setup screen
  const renderInitialSetup = () => (
    <StyledPaper elevation={3}>
      <Typography variant="h5" gutterBottom>
        Welcome to HereIAm
      </Typography>
      <Typography variant="body1" paragraph>
        To get started, select a folder containing the documents you want to index and search through.
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

  // Render the main search interface
  const renderSearchInterface = () => (
    <>
      <StyledPaper elevation={3}>
        <SearchBox>
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
            disabled={isSearching || !searchQuery.trim() || !hasIndexedData}
          >
            Search
          </Button>
        </SearchBox>
        
        <Box sx={{ mt: 2, mb: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            Granularity Level:
          </Typography>
          <FormGroup row>
            <FormControlLabel
              control={
                <Checkbox
                  checked={granularityLevels.paragraph}
                  onChange={(e) => setGranularityLevels({
                    ...granularityLevels,
                    paragraph: e.target.checked
                  })}
                />
              }
              label="Paragraph"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={granularityLevels.page}
                  onChange={(e) => setGranularityLevels({
                    ...granularityLevels,
                    page: e.target.checked
                  })}
                />
              }
              label="Page"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={granularityLevels.document}
                  onChange={(e) => setGranularityLevels({
                    ...granularityLevels,
                    document: e.target.checked
                  })}
                />
              }
              label="Document"
            />
          </FormGroup>
        </Box>
        
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
                <GranularityBadge theme={theme}>
                  {result.granularity || 'paragraph'}
                </GranularityBadge>
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

  // Render the settings drawer
  const renderSettingsDrawer = () => (
    <Drawer
      anchor="right"
      open={settingsOpen}
      onClose={toggleSettings}
      sx={{ '& .MuiDrawer-paper': { width: { xs: '100%', sm: 400 } } }}
    >
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">Settings</Typography>
          <IconButton onClick={toggleSettings}>
            <CloseIcon />
          </IconButton>
        </Box>
        
        <Typography variant="subtitle1" gutterBottom>
          Document Folder
        </Typography>
        
        <Box sx={{ mb: 3 }}>
          {selectedFolder ? (
            <Typography variant="body2" sx={{ mb: 2 }}>
              Current folder: <strong>{selectedFolder}</strong>
            </Typography>
          ) : (
            <Typography variant="body2" sx={{ mb: 2 }}>
              No folder selected
            </Typography>
          )}
          
          <Button
            variant="outlined"
            startIcon={<FolderIcon />}
            onClick={handleSelectFolder}
            sx={{ mr: 2 }}
          >
            Change Folder
          </Button>
        </Box>
        
        <Divider sx={{ my: 3 }} />
        
        <Typography variant="subtitle1" gutterBottom>
          Indexing
        </Typography>
        
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" gutterBottom>
            Granularity Levels to Index:
          </Typography>
          <FormGroup>
            <FormControlLabel
              control={
                <Checkbox
                  checked={indexingGranularityLevels.paragraph}
                  onChange={(e) => setIndexingGranularityLevels({
                    ...indexingGranularityLevels,
                    paragraph: e.target.checked
                  })}
                />
              }
              label="Paragraph (smaller chunks, more precise results)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={indexingGranularityLevels.page}
                  onChange={(e) => setIndexingGranularityLevels({
                    ...indexingGranularityLevels,
                    page: e.target.checked
                  })}
                />
              }
              label="Page (medium chunks, balanced context)"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={indexingGranularityLevels.document}
                  onChange={(e) => setIndexingGranularityLevels({
                    ...indexingGranularityLevels,
                    document: e.target.checked
                  })}
                />
              }
              label="Document (entire documents, maximum context)"
            />
          </FormGroup>
        </Box>
        
        <Box>
          <Button
            variant="contained"
            color="primary"
            startIcon={isScanning ? <CircularProgress size={20} color="inherit" /> : <RefreshIcon />}
            onClick={() => scanDirectory()}
            disabled={isScanning || !selectedFolder || 
              (!indexingGranularityLevels.paragraph && 
               !indexingGranularityLevels.page && 
               !indexingGranularityLevels.document)}
            sx={{ mb: 2 }}
          >
            {isScanning ? 'Indexing...' : 'Re-Index Documents'}
          </Button>
          
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
        </Box>
      </Box>
    </Drawer>
  );

  return (
    <AppContainer>
      <AppBar position="static" color="primary">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            HereIAm
          </Typography>
          <IconButton color="inherit" size="large" onClick={toggleSettings}>
            <SettingsIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
      
      <MainContent>
        <Container maxWidth="lg">
          {needsInitialSetup ? renderInitialSetup() : renderSearchInterface()}
        </Container>
      </MainContent>
      
      {renderSettingsDrawer()}
    </AppContainer>
  );
}

export default App; 