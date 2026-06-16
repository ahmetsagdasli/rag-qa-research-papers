// server/src/server.js  (CommonJS)
// Sunucu kurulumu: SQLite init, Swagger /docs, /api router (tüm endpoint'ler routes.js'te).

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const swaggerUi = require('swagger-ui-express');

const apiRouter = require('./routes');
const db = require('./db');

// Kalıcı depolama: SQLite tablolarını açılışta oluştur
db.init();

const PORT = parseInt(process.env.PORT || '5050', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const DATA_DIR = path.join(__dirname, '..', 'data');

// Veri klasörü hazır olsun
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '25mb' }));

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

app.listen(PORT, () => {
  console.log(`🚀 Server http://localhost:${PORT}`);
});
