import React, { useRef, useState } from 'react';
import {
  Box, Card, CardContent, Typography, Button, LinearProgress, Stack, Alert, Fade,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { tokens } from '../theme';
import { uploadAndIndex } from '../api';

export default function UploadArea({ collectionId, onIndexed, onError }) {
  const inputRef = useRef();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [done, setDone] = useState(false);

  const processFiles = async (files) => {
    if (!files.length || collectionId == null) return;
    setBusy(true); setError(null); setDone(false); setProgress(0); setProgressMessage('');
    try {
      await uploadAndIndex(collectionId, files, (percent, message) => {
        setProgress(percent); setProgressMessage(message);
      });
      setDone(true);
      onIndexed?.();
    } catch (err) {
      console.error('Upload error:', err);
      setError(err.message);
      onError?.(); // hatada klasör listesini tazele (silinmiş/eski klasörleri temizler)
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleSelect = (e) => processFiles(Array.from(e.target.files || []));
  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    if (busy) return;
    const files = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    processFiles(files);
  };

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={2}>
          {error && <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>}

          <Box
            role="button" tabIndex={0} aria-label="Add PDF documents to this folder"
            onClick={() => !busy && inputRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); inputRef.current?.click(); } }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            sx={{
              cursor: busy ? 'default' : 'pointer', borderRadius: tokens.radius.md,
              p: { xs: 3, md: 4 }, textAlign: 'center', border: '2px dashed',
              borderColor: dragOver ? 'primary.main' : 'divider',
              bgcolor: (t) => alpha(t.palette.primary.main, dragOver ? 0.07 : 0.02),
              transform: dragOver ? 'scale(1.01)' : 'none',
              transition: 'all 0.2s ease',
              '&:hover': { borderColor: 'primary.main', bgcolor: (t) => alpha(t.palette.primary.main, 0.05) },
            }}
          >
            <Box sx={{ width: 60, height: 60, mx: 'auto', mb: 1.5, borderRadius: '50%',
              display: 'grid', placeItems: 'center', color: '#fff',
              background: tokens.gradient, boxShadow: tokens.shadow.accent,
              transform: dragOver ? 'translateY(-2px)' : 'none', transition: 'transform 0.2s ease' }}>
              <CloudUploadIcon />
            </Box>
            <Typography variant="h6" gutterBottom>Add documents to this folder</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Drag &amp; drop PDFs here, or click to browse
            </Typography>
            <Button variant="contained" startIcon={<CloudUploadIcon />} disabled={busy}
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}>
              Add Files
            </Button>
            <input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={handleSelect} />
          </Box>

          {busy && (
            <Box>
              <LinearProgress variant="determinate" value={progress} />
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 1 }}>
                <Typography variant="caption" color="text.secondary">{progressMessage}</Typography>
                <Typography variant="caption" color="primary" fontWeight={700}>{progress}%</Typography>
              </Stack>
            </Box>
          )}

          <Fade in={!busy && done}>
            <Alert icon={<CheckCircleIcon fontSize="inherit" />} severity="success">
              Indexed! You can now ask questions about this folder.
            </Alert>
          </Fade>
        </Stack>
      </CardContent>
    </Card>
  );
}
