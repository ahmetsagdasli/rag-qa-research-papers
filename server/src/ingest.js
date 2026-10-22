// server/src/ingest.js
// Klasör (collection) bazlı ingest: her koleksiyonun PDF'leri
// server/data/col_<id>/ altında durur. Chunk'lar collectionId ile etiketlenir,
// tek bir server/data/index.json içinde saklanır.

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const db = require("./db");
const { chunkDocument, normalizeConfig } = require("./chunking");
const vectorStore = require("./vector-store");

dotenv.config();

const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
const EMBED_BATCH_SIZE = parseInt(process.env.EMBED_BATCH_SIZE || "64", 10);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || undefined,
  timeout: 30000,
});

// Bir koleksiyonun dosya klasörü (yoksa oluştur)
function collectionDir(collectionId) {
  const dir = path.join(DATA_DIR, `col_${collectionId}`);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function chunkText(text, chunkSize = 800, overlap = 100) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length);
    chunks.push(text.slice(i, end));
    if (end === text.length) break;
    i = end - overlap;
    if (i < 0) i = 0;
  }
  return chunks;
}

function writeJSON(filePath, obj) {
  fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
}

function loadIndex() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(INDEX_PATH)) {
    return { version: 2, chunks: [], docs: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, "utf-8"));
  } catch {
    return { version: 2, chunks: [], docs: {} };
  }
}

async function embedBatch(texts) {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return res.data.map((d) => d.embedding);
}

async function processPdfFile(pdfPath, docId, collectionId, documentId, chunkingConfig) {
  const buffer = fs.readFileSync(pdfPath);
  const parsed = await pdfParse(buffer);
  const text = (parsed.text || "").replace(/\s+\n/g, "\n").trim();

  const pieces = chunkDocument(text, chunkingConfig);
  const total = pieces.length;
  const chunkEmbeddings = [];

  for (let start = 0; start < total; start += EMBED_BATCH_SIZE) {
    const batch = pieces.slice(start, start + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(batch.map((piece) => piece.text));
    for (let j = 0; j < batch.length; j++) {
      const i = start + j;
      chunkEmbeddings.push({
        id: `${docId}::${i}`,
        docId,
        collectionId,
        documentId, // DB documents.id — belge bazlı scope filtresi için
        chunkIndex: i,
        text: batch[j].text,
        vector: vectors[j],
        source: path.basename(pdfPath),
        sectionHeading: batch[j].sectionHeading,
        contentHash: batch[j].contentHash,
        chunkingStrategy: chunkingConfig.strategy,
        embeddingModel: EMBEDDING_MODEL,
      });
    }
    console.log(`  → ${path.basename(pdfPath)}: ${Math.min(start + batch.length, total)}/${total} chunk`);
  }

  const { size } = fs.statSync(pdfPath);
  return { chunkEmbeddings, stats: { chunks: total, chars: text.length, size } };
}

/**
 * Tek bir koleksiyonun PDF'lerini (yeniden) indeksler.
 * Sadece o koleksiyonun chunk'ları temizlenip yeniden üretilir.
 * @param {number} collectionId
 * @param {(step:string, progress:number)=>void} [onProgress]
 */
async function ingestCollection(collectionId, onProgress, options = {}) {
  const chunkingConfig = normalizeConfig(options.chunking);
  const dir = collectionDir(collectionId);
  const index = loadIndex();

  // Bu koleksiyona ait eski chunk'ları çıkar (diğer koleksiyonlar korunur)
  index.chunks = (index.chunks || []).filter((c) => c.collectionId !== collectionId);

  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".pdf"));

  if (files.length === 0) {
    onProgress?.("No PDF files in this folder", 100);
    writeJSON(INDEX_PATH, index);
    return { totalChunks: index.chunks.length, collectionChunks: 0 };
  }

  onProgress?.("Reading PDF files...", 40);
  let collectionChunks = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const full = path.join(dir, file);
    const docId = `${collectionId}_${path.parse(file).name}`;

    onProgress?.(`Chunking ${file}...`, Math.round(40 + (i / files.length) * 35));
    console.log(`\n🔎 [col ${collectionId}] Processing: ${file}`);

    // DB belge kaydının id'sini al (chunk metadata'sına eklenir)
    const docRow = db.getDocumentByFilename(collectionId, file);
    const documentId = docRow ? docRow.id : null;

    const { chunkEmbeddings } = await processPdfFile(full, docId, collectionId, documentId, chunkingConfig);

    onProgress?.(
      `Generating embeddings for ${file}...`,
      Math.round(40 + ((i + 0.7) / files.length) * 35)
    );

    index.chunks.push(...chunkEmbeddings);
    collectionChunks += chunkEmbeddings.length;

    // DB'deki belge kaydının chunk sayısını güncelle
    db.updateDocumentChunks({ collectionId, filename: file, chunkCount: chunkEmbeddings.length });
  }

  onProgress?.("Building vector index...", 90);
  writeJSON(INDEX_PATH, index);
  if (vectorStore.enabled()) {
    await vectorStore.replaceCollection(collectionId, index.chunks.filter((chunk) => chunk.collectionId === collectionId));
  }
  onProgress?.("Setting up retrieval system...", 95);
  console.log(`✅ [col ${collectionId}] ${collectionChunks} chunks indexed (total ${index.chunks.length})`);

  return { totalChunks: index.chunks.length, collectionChunks, chunking: chunkingConfig };
}

module.exports = {
  ingestCollection,
  collectionDir,
  DATA_DIR,
  INDEX_PATH,
  chunkText,
};
