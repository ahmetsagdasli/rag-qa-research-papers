// server/src/ingest.js
// Amaç: server/data içindeki TÜM PDF'leri tarayıp metne çevirir, parçalar,
// embedding üretir ve server/data/index.json dosyasına kaydeder.

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

// Modeller (.env.example ile uyumlu)
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

// OpenAI istemcisi
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 30000, // 30 saniye timeout
});

// Basit metin bölücü - daha küçük chunk'lar için hızlı işlem
function chunkText(text, chunkSize = 800, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    const slice = text.slice(i, end);
    chunks.push(slice);
    if (end === text.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

// JSON'u güvenli yaz
function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
}

// Var olan index yoksa oluştur
function initIndex() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_PATH)) {
    writeJSON(INDEX_PATH, { version: 1, chunks: [], docs: {} });
  }
}

// Embedding üret
async function embed(text) {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

async function processPdfFile(pdfPath, docId, onProgress, fileIndex, totalFiles) {
  const buffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(buffer);
  const text = (parsed.text || "").replace(/\s+\n/g, "\n").trim();

  const pieces = chunkText(text, 800, 100);
  
  // Test için sadece ilk 10 chunk'ı işle (hızlı demo)
  const maxChunks = Math.min(pieces.length, 10);
  const chunkEmbeddings = [];

  console.log(`  Processing ${maxChunks} chunks for ${path.basename(pdfPath)} (from ${pieces.length} total)`);

  for (let i = 0; i < maxChunks; i++) {
    const piece = pieces[i];
    const vector = await embed(piece);
    chunkEmbeddings.push({
      id: `${docId}::${i}`,
      docId,
      chunkIndex: i,
      text: piece,
      vector,
      source: path.basename(pdfPath),
    });
    // Hafif log
    if ((i + 1) % 3 === 0 || i === maxChunks - 1) {
      console.log(`  → ${path.basename(pdfPath)}: ${i + 1}/${maxChunks} chunk processed`);
    }
  }

  return { chunkEmbeddings, stats: { chunks: maxChunks, chars: text.length } };
}

// Ana ingest fonksiyonu
async function ingestAll(onProgress) {
  initIndex();

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  index.chunks = [];
  index.docs = {};

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (files.length === 0) {
    console.log("📁 No PDF files found in data folder. Upload from frontend first.");
    onProgress?.("No PDF files found", 100);
    writeJSON(INDEX_PATH, index);
    return index;
  }

  console.log("📚 Found PDF files:", files);
  onProgress?.("Reading PDF files...", 40);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const full = path.join(DATA_DIR, file);
    const docId = path.parse(file).name;

    // Progress for each file (40-75% range)
    const fileProgress = 40 + ((i / files.length) * 35);
    onProgress?.(`Chunking ${file}...`, Math.round(fileProgress));

    console.log(`\n🔎 Processing: ${file}`);
    const { chunkEmbeddings, stats } = await processPdfFile(full, docId, onProgress, i, files.length);

    // After processing file, show embedding progress
    const embeddingProgress = 40 + (((i + 0.7) / files.length) * 35);
    onProgress?.(`Generating embeddings for ${file}...`, Math.round(embeddingProgress));

    index.docs[docId] = {
      id: docId,
      file: file,
      chunks: chunkEmbeddings.length,
      updatedAt: new Date().toISOString(),
    };

    index.chunks.push(...chunkEmbeddings);
  }

  onProgress?.("Building vector index...", 85);
  writeJSON(INDEX_PATH, index);
  
  onProgress?.("Setting up retrieval system...", 95);
  console.log(`\n✅ index.json updated: ${INDEX_PATH}`);
  console.log(`   Total chunks: ${index.chunks.length}`);
  
  return index;
}

// Başka yerden çağrılabilsin
module.exports = {
  ingestAll,
};

// CLI olarak çalıştırılırsa
if (require.main === module) {
  ingestAll().catch((err) => {
    console.error("❌ Ingest sırasında hata:", err);
    process.exit(1);
  });
}
