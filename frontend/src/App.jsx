import React, { useState } from 'react';
import { ThemeProvider, CssBaseline, Container, Box, Typography, Grid, Drawer, List, ListItem, ListItemText, ListItemIcon, Divider, IconButton } from '@mui/material';
import { Description as DocumentIcon, Menu as MenuIcon } from '@mui/icons-material';
import theme from './theme';
import UploadArea from './components/UploadArea';
import ChatQA from './components/ChatQA';


const DRAWER_WIDTH = 280;

export default function App() {
const [documents, setDocuments] = useState([]);
const [sidebarOpen, setSidebarOpen] = useState(true);

const handleDocumentsIndexed = (docs) => {
setDocuments(docs);
};

const formatFileSize = (bytes) => {
if (bytes === 0) return '0 B';
const k = 1024;
const sizes = ['B', 'KB', 'MB', 'GB'];
const i = Math.floor(Math.log(bytes) / Math.log(k));
return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

return (
<ThemeProvider theme={theme}>
<CssBaseline />
<Box sx={{ display: 'flex' }}>
{/* Sidebar */}
<Drawer
variant="persistent"
anchor="left"
open={sidebarOpen}
sx={{
width: DRAWER_WIDTH,
flexShrink: 0,
'& .MuiDrawer-paper': {
width: DRAWER_WIDTH,
boxSizing: 'border-box',
},
}}
>
<Box sx={{ p: 2 }}>
<Typography variant="h6" gutterBottom>
Uploaded Documents
</Typography>
<Divider />
</Box>
<List>
{documents.length === 0 ? (
<ListItem>
<ListItemText 
primary="No documents uploaded yet" 
secondary="Upload your PDF documents"
/>
</ListItem>
) : (
documents.map((doc, index) => (
<ListItem key={index}>
<ListItemIcon>
<DocumentIcon color="primary" />
</ListItemIcon>
<ListItemText
primary={doc.filename}
secondary={`Size: ${formatFileSize(doc.size || 0)}`}
/>
</ListItem>
))
)}
</List>
</Drawer>

{/* Main content */}
<Box
component="main"
sx={{
flexGrow: 1,
py: 4,
ml: sidebarOpen ? 0 : `-${DRAWER_WIDTH}px`,
transition: theme.transitions.create(['margin'], {
easing: theme.transitions.easing.sharp,
duration: theme.transitions.duration.leavingScreen,
}),
}}
>
<Container maxWidth="md">
<Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
<IconButton
edge="start"
onClick={() => setSidebarOpen(!sidebarOpen)}
sx={{ mr: 2 }}
>
<MenuIcon />
</IconButton>
<Box sx={{ textAlign: 'center', flexGrow: 1 }}>
<Typography variant="h4" fontWeight={700}>RAG QA</Typography>
<Typography color="text.secondary">Context-aware question answering based on uploaded documents</Typography>
</Box>
</Box>
<Grid container spacing={2}>
<Grid item xs={12}>
<UploadArea onIndexed={handleDocumentsIndexed} />
</Grid>
<Grid item xs={12}>
<ChatQA />
</Grid>
</Grid>
</Container>
</Box>
</Box>
</ThemeProvider>
);
}