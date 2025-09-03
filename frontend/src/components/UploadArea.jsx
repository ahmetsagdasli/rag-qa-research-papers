import React, { useRef, useState } from 'react';
import { Box, Card, CardContent, Typography, Button, LinearProgress, Stack, Chip, Alert } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { ingest, listPapers } from '../api';


export default function UploadArea({ onIndexed }) {
const inputRef = useRef();
const [busy, setBusy] = useState(false);
const [docs, setDocs] = useState([]);
const [error, setError] = useState(null);
const [progress, setProgress] = useState(0);
const [progressMessage, setProgressMessage] = useState('');


const handleSelect = async (e) => {
const files = Array.from(e.target.files || []);
if (!files.length) return;
setBusy(true);
setError(null);
setProgress(0);
setProgressMessage('');
try {
console.log('Starting upload of', files.length, 'files');
const result = await ingest(files, (percent, message) => {
setProgress(percent);
setProgressMessage(message);
});
console.log('Upload completed successfully');
setDocs(result.documents || []);
onIndexed?.(result.documents || []);
// Show completion message for 2 seconds
setTimeout(() => {
setProgressMessage('You can now ask questions!');
}, 1000);
} catch (err) {
console.error('Upload error:', err);
setError(err.message);
} finally {
setBusy(false);
inputRef.current.value = '';
}
};


return (
<Card>
{busy && (
<Box sx={{ width: '100%', px: 2, py: 1 }}>
<LinearProgress variant="determinate" value={progress} />
<Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
<Typography variant="body2" color="text.secondary" sx={{ minWidth: 50 }}>
{progress}%
</Typography>
<Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
{progressMessage}
</Typography>
</Box>
</Box>
)}
<CardContent>
<Stack spacing={2} alignItems="center">
<Typography variant="h6">Upload Research Papers (PDF)</Typography>
{error && <Alert severity="error">{error}</Alert>}
{!busy && progress === 100 && (
<Alert severity="success">
Upload completed! You can now ask questions.
</Alert>
)}
<Button 
variant="contained" 
startIcon={<CloudUploadIcon />} 
onClick={() => inputRef.current.click()}
disabled={busy}
>
Upload PDFs
</Button>
<input ref={inputRef} type="file" accept="application/pdf" multiple hidden onChange={handleSelect} />
<Box>
{docs.map((d, index) => (
<Chip 
key={index} 
label={d.filename} 
color="primary" 
variant="outlined" 
sx={{ m: 0.5 }} 
/>
))}
</Box>
<Typography variant="body2" color="text.secondary">
After uploading, ask questions; the system automatically finds relevant context.
</Typography>
</Stack>
</CardContent>
</Card>
);
}