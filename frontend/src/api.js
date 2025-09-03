export async function ingest(files, onProgress) {
// Phase 1: Upload files (30% of progress)
const uploadedFiles = [];
const totalFiles = files.length;

onProgress?.(0, 'Starting file upload...');

for (let i = 0; i < files.length; i++) {
const file = files[i];
const fd = new FormData();
fd.append('file', file);

// Update progress for each file upload
const fileProgress = ((i + 1) / totalFiles) * 30;
onProgress?.(Math.round(fileProgress), `Uploading ${file.name}...`);

const res = await fetch('/api/upload', { method: 'POST', body: fd });
if (!res.ok) throw new Error(`Upload failed for ${file.name}`);
const result = await res.json();
uploadedFiles.push({
filename: file.name,
path: result.path,
size: file.size
});
}

onProgress?.(30, 'Files uploaded successfully');

// Phase 2: Start processing and poll for progress
const indexPromise = fetch('/api/rebuild-index', { method: 'POST' });

// Poll progress endpoint
const pollProgress = async () => {
try {
const progressRes = await fetch('/api/progress');
if (progressRes.ok) {
const { step, progress } = await progressRes.json();
if (progress > 30) { // Only show progress after upload phase
onProgress?.(progress, step);
}
}
} catch (e) {
// Ignore polling errors
}
};

// Poll every 300ms
const progressInterval = setInterval(pollProgress, 300);

try {
const indexRes = await indexPromise;
clearInterval(progressInterval);

if (!indexRes.ok) throw new Error('Index rebuild failed');
const indexResult = await indexRes.json();

onProgress?.(100, 'Processing completed! Ready for questions.');

return { 
uploadedFiles, 
totalChunks: indexResult.totalChunks,
documents: uploadedFiles 
};
} catch (error) {
clearInterval(progressInterval);
throw error;
}
}


export async function listPapers() {
// Since there's no /api/papers endpoint, return empty for now
// In a real app, you'd want to track uploaded documents
return { documents: [] };
}


export async function ask(question, topK = 4) {
const res = await fetch('/api/ask', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ question, topK })
});
if (!res.ok) throw new Error('Ask failed');
return res.json();
}