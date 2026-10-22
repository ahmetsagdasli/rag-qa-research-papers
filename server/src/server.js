// server/src/server.js  (CommonJS)
// Sunucu kurulumu: SQLite init, Swagger /docs, /api router (tüm endpoint'ler routes.js'te).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');
const crypto = require('crypto');

const apiRouter = require('./routes');
const db = require('./db');
const vectorStore = require('./vector-store');
const rateLimiter = require('./rate-limiter');
const { requireApiKey } = require('./auth');

// Kalıcı depolama: SQLite tablolarını açılışta oluştur
db.init();
if (vectorStore.enabled()) vectorStore.migrate().then(() => console.info('pgvector schema ready')).catch((error) => console.error('pgvector migration failed:', error.message));

const PORT = parseInt(process.env.PORT || '5050', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DATA_DIR = path.join(__dirname, '..', 'data');

// Veri klasörü hazır olsun
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  const started = Date.now();
  res.on('finish', () => console.info(JSON.stringify({ requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started })));
  next();
});

// Rate limiter: REDIS_URL set edilmişse çoklu instance'lar arasında paylaşılan sayaç, yoksa in-memory fallback.
app.use('/api', rateLimiter.middleware());

// API_KEY set edilmişse tüm /api istekleri X-API-Key header'ı gerektirir (lokal/tek kullanıcı için opsiyonel).
app.use('/api', requireApiKey());

app.get('/health', (_req, res) => res.json({ ok: true }));

// OpenAPI / Swagger UI -> http://localhost:5050/docs
const OPENAPI_PATH = path.join(__dirname, '..', 'openapi.yaml');
try {
  const openapiDoc = YAML.parse(fs.readFileSync(OPENAPI_PATH, 'utf-8'));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiDoc));
} catch (e) {
  console.warn('⚠️  Could not load openapi.yaml, /docs disabled:', e.message);
}

// Tüm API endpoint'leri
app.use('/api', apiRouter);

app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ ok: false, error: 'PDF must be 25 MB or smaller.' });
  if (err?.message === 'Only PDF files are accepted.') return res.status(415).json({ ok: false, error: err.message });
  console.error('Unhandled request error:', err);
  return res.status(500).json({ ok: false, error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT}`);
});
