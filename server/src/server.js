// server/src/server.js  (CommonJS sürümü)
// Amaç: Upload endpoint'i ile gelen PDF'leri server/data içine kaydeder,
// /api/rebuild-index ile ingest'i tetikler, /api/ask için routes'u bağlar.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const { ingestAll } = require('./ingest');
const apiRouter = require('./routes');

const PORT = parseInt(process.env.PORT || '5050', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DATA_DIR = path.join(__dirname, '..', 'data');

// Upload klasörü hazır olsun
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Multer ayarı (yalnızca PDF)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, DATA_DIR),
  filename: (_req, file, cb) => {
    // Orijinal adı mümkün olduğunca koru (güvenli hale getir)
    const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
    cb(null, safe);
  },
});
function pdfOnly(_req, file, cb) {
  const ok =
    file.mimetype === 'application/pdf' ||
    file.originalname.toLowerCase().endsWith('.pdf');
  cb(ok ? null : new Error('Only PDF files are accepted.'), ok);
}
const upload = multer({ storage, fileFilter: pdfOnly });

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '25mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Tek PDF upload
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    return res.json({
      ok: true,
      file: req.file.filename,
      path: path.join('server', 'data', req.file.filename),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error during upload' });
  }
});

// Progress tracking
let currentProgress = { step: '', progress: 0 };

// Get current progress
app.get('/api/progress', (_req, res) => {
  res.json(currentProgress);
});

// İndeksi yeniden oluştur (server/data içindeki tüm PDF'ler)
app.post('/api/rebuild-index', async (_req, res) => {
  try {
    currentProgress = { step: 'Starting processing...', progress: 35 };
    const index = await ingestAll((step, progress) => {
      currentProgress = { step, progress };
    });
    currentProgress = { step: 'Processing completed! Ready for questions.', progress: 100 };
    return res.json({ ok: true, totalChunks: index.chunks.length });
  } catch (e) {
    console.error(e);
    currentProgress = { step: 'Error occurred', progress: 0 };
    return res.status(500).json({ error: 'Error occurred during ingestion' });
  }
});

// /api/ask vb. için router
app.use('/api', apiRouter);

// Statik dosya servis etmek istersen (opsiyonel)
// app.use('/files', express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT}`);
});
