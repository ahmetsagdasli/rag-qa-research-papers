import React, { useState, useEffect, useCallback } from 'react';
import {
  ThemeProvider, CssBaseline, Container, Box, Typography, Stack, Drawer,
  List, ListItemButton, ListItemText, Divider, IconButton, Avatar, Chip, Tooltip,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Paper,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import {
  AutoAwesome as SparkleIcon, CreateNewFolder as NewFolderIcon,
  Folder as FolderIcon, FolderOpen as FolderOpenIcon, Description as DocumentIcon,
  MenuOpen as MenuOpenIcon, Menu as MenuIcon, Delete as DeleteIcon,
  TouchApp as TouchAppIcon,
} from '@mui/icons-material';
import theme, { tokens } from './theme';
import UploadArea from './components/UploadArea';
import ChatQA from './components/ChatQA';
import SavedAnswers from './components/SavedAnswers';
import EvaluationDashboard from './components/EvaluationDashboard';
import GraphRetrieval from './components/GraphRetrieval';
import { listCollections, createCollection, deleteCollection, deleteDocument, listDocuments, listAnswers } from './api';

const DRAWER_WIDTH = 320;

export default function App() {
  const [collections, setCollections] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const selected = collections.find((c) => c.id === selectedId) || null;

  const refreshCollections = useCallback(async () => {
    const res = await listCollections();
    setCollections(res.collections || []);
    return res.collections || [];
  }, []);

  const refreshSelected = useCallback(async (id) => {
    if (id == null) { setDocuments([]); setAnswers([]); return; }
    const [docs, ans] = await Promise.all([listDocuments(id), listAnswers(id)]);
    setDocuments(docs.documents || []);
    setAnswers(ans.answers || []);
  }, []);

  useEffect(() => { refreshCollections().catch(console.error); }, [refreshCollections]);
  useEffect(() => { refreshSelected(selectedId).catch(console.error); }, [selectedId, refreshSelected]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    const res = await createCollection(name);
    setNewName('');
    setDialogOpen(false);
    await refreshCollections();
    setSelectedId(res.collection.id);
  };

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this folder and all its documents & saved answers?')) return;
    await deleteCollection(id);
    if (selectedId === id) setSelectedId(null);
    await refreshCollections();
  };

  const handleDeleteDocument = async (document) => {
    if (!window.confirm(`Delete “${document.original_name || document.filename}”? This also removes it from the search index.`)) return;
    try {
      await deleteDocument(document.id);
      await Promise.all([refreshSelected(selectedId), refreshCollections()]);
    } catch (error) {
      window.alert(error.message || 'Could not delete document.');
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar */}
        <Drawer
          variant="persistent" anchor="left" open={sidebarOpen}
          sx={{ width: DRAWER_WIDTH, flexShrink: 0,
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          {/* Brand */}
          <Box sx={{ p: 2.5 }}>
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar sx={{ width: 42, height: 42, background: tokens.gradient, boxShadow: tokens.shadow.accent }}>
                <SparkleIcon fontSize="small" />
              </Avatar>
              <Box>
                <Typography variant="subtitle1" lineHeight={1.2}>RAG QA</Typography>
                <Typography variant="caption">Research assistant</Typography>
              </Box>
            </Stack>
          </Box>
          <Divider />

          {/* Folders header */}
          <Box sx={{ px: 2.5, pt: 2.5, pb: 1 }}>
            <Stack direction="row" alignItems="center">
              <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em' }}>
                Folders
              </Typography>
              <Tooltip title="New folder" arrow>
                <IconButton size="small" color="primary" aria-label="Create new folder"
                  sx={{ ml: 'auto', bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                    '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.16) } }}
                  onClick={() => setDialogOpen(true)}>
                  <NewFolderIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Box>

          {/* Folder list / empty state */}
          <List sx={{ px: 1.5, flexShrink: 0 }}>
            {collections.length === 0 ? (
              <Paper variant="outlined" sx={{ mx: 0.5, p: 2.5, textAlign: 'center', borderStyle: 'dashed',
                borderColor: 'divider', bgcolor: (t) => alpha(t.palette.primary.main, 0.02) }}>
                <Typography variant="body2" fontWeight={600} gutterBottom>No folders yet</Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Use the <Box component="span" sx={{ color: 'primary.main', fontWeight: 700 }}>+</Box> above to create one.
                </Typography>
              </Paper>
            ) : collections.map((c) => {
              const active = c.id === selectedId;
              return (
                <ListItemButton
                  key={c.id} selected={active} onClick={() => setSelectedId(c.id)}
                  sx={{ mb: 0.5, py: 1,
                    '& .delete-btn': { opacity: 0, transition: 'opacity 0.16s ease' },
                    '&:hover .delete-btn': { opacity: 1 },
                    '&.Mui-selected': { bgcolor: (t) => alpha(t.palette.primary.main, 0.10),
                      boxShadow: (t) => `inset 3px 0 0 ${t.palette.primary.main}` },
                    '&.Mui-selected:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.16) } }}
                >
                  <Avatar variant="rounded" sx={{ width: 34, height: 34, mr: 1.5,
                    background: active ? tokens.gradient : (t) => alpha(t.palette.primary.main, 0.10),
                    color: active ? '#fff' : 'primary.main' }}>
                    {active ? <FolderOpenIcon fontSize="small" /> : <FolderIcon fontSize="small" />}
                  </Avatar>
                  <ListItemText
                    primaryTypographyProps={{ variant: 'body2', fontWeight: 600, noWrap: true }}
                    secondaryTypographyProps={{ variant: 'caption' }}
                    primary={c.name}
                    secondary={`${c.document_count} docs · ${c.answer_count} saved`}
                  />
                  <Tooltip title="Delete folder" arrow>
                    <IconButton className="delete-btn" size="small" aria-label={`Delete folder ${c.name}`}
                      onClick={(e) => handleDelete(c.id, e)}
                      sx={{ color: 'text.secondary', '&:hover': { color: 'error.main', bgcolor: (t) => alpha(t.palette.error.main, 0.08) } }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemButton>
              );
            })}
          </List>

          {/* Documents in selected folder */}
          {selected && (
            <>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ px: 2.5, py: 1, overflowY: 'auto' }}>
                <Typography variant="overline" sx={{ color: 'text.secondary', fontWeight: 700, letterSpacing: '0.08em' }}>
                  Documents
                </Typography>
                {documents.length === 0 ? (
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>
                    No documents yet — add PDFs on the right.
                  </Typography>
                ) : (
                  <Stack spacing={0.75} sx={{ mt: 1 }}>
                    {documents.map((d) => (
                      <Stack key={d.id} direction="row" spacing={1.25} alignItems="center"
                        sx={{ p: 1, borderRadius: 2, border: '1px solid', borderColor: 'divider',
                          bgcolor: (t) => alpha(t.palette.primary.main, 0.03) }}>
                        <DocumentIcon fontSize="small" color="primary" />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography variant="caption" fontWeight={600} noWrap display="block">
                            {d.original_name || d.filename}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">{d.chunk_count} chunks</Typography>
                        </Box>
                        <Tooltip title="Delete document" arrow>
                          <IconButton size="small" aria-label={`Delete ${d.original_name || d.filename}`}
                            onClick={() => handleDeleteDocument(d)} sx={{ ml: 'auto', color: 'text.secondary', '&:hover': { color: 'error.main' } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </Box>
            </>
          )}
        </Drawer>

        {/* Main */}
        <Box component="main" sx={{ flexGrow: 1, py: { xs: 3, md: 5 }, px: { xs: 1, sm: 2 } }}>
          <Container maxWidth="md" disableGutters={false}>
            {/* Header */}
            <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: { xs: 3, md: 4 } }}>
              <Tooltip title={sidebarOpen ? 'Hide folders' : 'Show folders'} arrow>
                <IconButton onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle folder panel"
                  sx={{ bgcolor: (t) => alpha(t.palette.primary.main, 0.08),
                    '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.16) } }}>
                  {sidebarOpen ? <MenuOpenIcon /> : <MenuIcon />}
                </IconButton>
              </Tooltip>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="h4" noWrap sx={{ background: tokens.gradientText,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {selected ? selected.name : 'Ask your research papers'}
                </Typography>
                <Typography color="text.secondary" variant="body2">
                  {selected
                    ? 'Add documents to this folder, then ask questions scoped to it.'
                    : 'Create a folder to organize and group your documents.'}
                </Typography>
              </Box>
            </Stack>

            {/* Content */}
            {!selected ? (
              <Paper variant="outlined" sx={{ p: { xs: 4, md: 6 }, textAlign: 'center', borderStyle: 'dashed',
                borderColor: 'divider', background: tokens.gradientSoft }}>
                <Avatar sx={{ width: 64, height: 64, mx: 'auto', mb: 2, background: tokens.gradient, boxShadow: tokens.shadow.accent }}>
                  <TouchAppIcon />
                </Avatar>
                <Typography variant="h6" gutterBottom>Pick a folder to begin</Typography>
                <Typography color="text.secondary" sx={{ maxWidth: 420, mx: 'auto', mb: 3 }}>
                  Select a folder from the left panel, or create a new one to upload papers and start asking questions.
                </Typography>
                <Button variant="contained" startIcon={<NewFolderIcon />} onClick={() => setDialogOpen(true)}>
                  Create your first folder
                </Button>
              </Paper>
            ) : (
              <Stack spacing={3}>
                <UploadArea
                  collectionId={selected.id}
                  onIndexed={() => { refreshSelected(selected.id); refreshCollections(); }}
                  onError={() => { refreshCollections(); }}
                />
                <ChatQA
                  collection={selected}
                  collections={collections}
                  hasDocuments={documents.length > 0}
                  onSaved={() => { refreshSelected(selected.id); refreshCollections(); }}
                />
                <SavedAnswers answers={answers} />
                <EvaluationDashboard />
                <GraphRetrieval collection={selected} />
              </Stack>
            )}
          </Container>
        </Box>
      </Box>

      {/* New folder dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus fullWidth label="Folder name" placeholder="e.g. Transformers, Thesis sources"
            value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()} sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setDialogOpen(false)} color="inherit">Cancel</Button>
          <Button variant="contained" onClick={handleCreate} disabled={!newName.trim()}>Create</Button>
        </DialogActions>
      </Dialog>
    </ThemeProvider>
  );
}
