// server/src/db.js
// SQLite tabanlı kalıcı depolama katmanı (better-sqlite3).
// Veritabanı dosyası: <proje-kökü>/data/app.db (yoksa otomatik oluşturulur).
// Bu modül yalnızca altyapıyı sağlar; route'lar bir sonraki adımda bağlanacak.

if (process.env.VERCEL && process.env.DATABASE_URL) {
  module.exports = require("./postgres-db");
} else {
const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// <proje-kökü>/data  ->  server/src/db.js'ten iki seviye yukarı
const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

// Veri klasörü yoksa oluştur
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
// Performans + tutarlılık ayarları
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

/**
 * Tabloları oluşturur (idempotent). Uygulama açılışında çağrılmalı.
 */
function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS collections (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
      filename      TEXT NOT NULL,
      original_name TEXT,
      uploaded_at   TEXT NOT NULL DEFAULT (datetime('now')),
      chunk_count   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS answers (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      collection_id INTEGER REFERENCES collections(id) ON DELETE CASCADE,
      document_id   INTEGER REFERENCES documents(id) ON DELETE SET NULL,
      question      TEXT NOT NULL,
      answer        TEXT NOT NULL,
      sources_json  TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id);
    CREATE INDEX IF NOT EXISTS idx_answers_collection   ON answers(collection_id);
    CREATE INDEX IF NOT EXISTS idx_answers_document     ON answers(document_id);
    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, dataset_version TEXT NOT NULL,
      config_json TEXT NOT NULL, metrics_json TEXT NOT NULL, status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_evaluation_runs_dataset ON evaluation_runs(dataset_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS reproducibility_runs (id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL, repeats INTEGER NOT NULL, result_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  return db;
}

function saveEvaluationRun(run) {
  db.prepare(`INSERT INTO evaluation_runs (id, dataset_id, dataset_version, config_json, metrics_json, status)
    VALUES (?, ?, ?, ?, ?, ?)`).run(run.id, run.datasetId, run.datasetVersion, JSON.stringify(run.config), JSON.stringify(run.metrics), run.status || "completed");
  return getEvaluationRun(run.id);
}
function getEvaluationRun(id) {
  const row=db.prepare("SELECT * FROM evaluation_runs WHERE id = ?").get(id); if(!row) return undefined;
  return { ...row, config: JSON.parse(row.config_json), metrics: JSON.parse(row.metrics_json) };
}
function listEvaluationRuns() { return db.prepare("SELECT * FROM evaluation_runs ORDER BY created_at DESC, id DESC").all().map((row)=>({ ...row, config:JSON.parse(row.config_json), metrics:JSON.parse(row.metrics_json) })); }
function saveReproducibilityRun(run) { db.prepare("INSERT INTO reproducibility_runs (id,evaluation_id,repeats,result_json) VALUES (?,?,?,?)").run(run.id,run.evaluationId,run.repeats,JSON.stringify(run.result)); return { ...run, created_at: new Date().toISOString() }; }
function listReproducibilityRuns(evaluationId) { return db.prepare("SELECT * FROM reproducibility_runs WHERE evaluation_id=? ORDER BY created_at DESC").all(evaluationId).map((r)=>({...r,result:JSON.parse(r.result_json)})); }

/* ----------------------------- collections ----------------------------- */

/**
 * Yeni bir koleksiyon (klasör/grup) oluşturur.
 * @param {string} name
 * @returns {{id:number, name:string, created_at:string}}
 */
function createCollection(name) {
  const info = db
    .prepare("INSERT INTO collections (name) VALUES (?)")
    .run(name);
  return db
    .prepare("SELECT * FROM collections WHERE id = ?")
    .get(info.lastInsertRowid);
}

/**
 * Tüm koleksiyonları (en yeni önce) listeler.
 * @returns {Array<{id:number, name:string, created_at:string}>}
 */
function listCollections() {
  return db
    .prepare("SELECT * FROM collections ORDER BY created_at DESC, id DESC")
    .all();
}

/**
 * Tek bir koleksiyonu id ile döndürür (yoksa undefined).
 * @param {number} id
 * @returns {object|undefined}
 */
function getCollection(id) {
  return db.prepare("SELECT * FROM collections WHERE id = ?").get(id);
}

/**
 * Koleksiyonları belge ve cevap sayılarıyla birlikte listeler.
 * @returns {Array<{id, name, created_at, document_count, answer_count}>}
 */
function listCollectionsWithStats() {
  return db
    .prepare(
      `SELECT c.*,
              (SELECT COUNT(*) FROM documents d WHERE d.collection_id = c.id) AS document_count,
              (SELECT COUNT(*) FROM answers   a WHERE a.collection_id = c.id) AS answer_count
       FROM collections c
       ORDER BY c.created_at DESC, c.id DESC`
    )
    .all();
}

/**
 * Bir koleksiyonu (ve CASCADE ile belge/cevaplarını) siler.
 * @param {number} id
 */
function deleteCollection(id) {
  db.prepare("DELETE FROM collections WHERE id = ?").run(id);
}

/* ------------------------------ documents ------------------------------ */

/**
 * Bir koleksiyona belge kaydı ekler.
 * @param {{collectionId:number, filename:string, originalName?:string, chunkCount?:number}} doc
 * @returns {object} eklenen belge satırı
 */
function addDocument({ collectionId, filename, originalName = null, chunkCount = 0 }) {
  const info = db
    .prepare(
      `INSERT INTO documents (collection_id, filename, original_name, chunk_count)
       VALUES (?, ?, ?, ?)`
    )
    .run(collectionId, filename, originalName, chunkCount);
  return db
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(info.lastInsertRowid);
}

/**
 * Bir koleksiyon + dosya adına göre belge kaydını döndürür.
 * @param {number} collectionId
 * @param {string} filename
 * @returns {object|undefined}
 */
function getDocumentByFilename(collectionId, filename) {
  return db
    .prepare("SELECT * FROM documents WHERE collection_id = ? AND filename = ?")
    .get(collectionId, filename);
}

function getDocument(id) {
  return db.prepare("SELECT * FROM documents WHERE id = ?").get(id);
}

/**
 * Bir belgenin chunk sayısını günceller (ingest sonrası).
 * @param {{collectionId:number, filename:string, chunkCount:number}} p
 */
function updateDocumentChunks({ collectionId, filename, chunkCount }) {
  db.prepare(
    "UPDATE documents SET chunk_count = ? WHERE collection_id = ? AND filename = ?"
  ).run(chunkCount, collectionId, filename);
}

/**
 * Bir belgeyi siler.
 * @param {number} id
 */
function deleteDocument(id) {
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
}

/**
 * Belgeleri listeler. collectionId verilirse o koleksiyona filtreler.
 * @param {number} [collectionId]
 * @returns {Array<object>}
 */
function listDocuments(collectionId) {
  if (collectionId != null) {
    return db
      .prepare(
        "SELECT * FROM documents WHERE collection_id = ? ORDER BY uploaded_at DESC, id DESC"
      )
      .all(collectionId);
  }
  return db
    .prepare("SELECT * FROM documents ORDER BY uploaded_at DESC, id DESC")
    .all();
}

/* ------------------------------- answers ------------------------------- */

/**
 * Bir soru-cevap kaydını saklar. sources dizisi JSON olarak serileştirilir.
 * @param {{collectionId?:number, documentId?:number, question:string, answer:string, sources?:Array}} entry
 * @returns {object} eklenen cevap satırı (sources parse edilmiş haliyle)
 */
function saveAnswer({ collectionId = null, documentId = null, question, answer, sources = [] }) {
  const info = db
    .prepare(
      `INSERT INTO answers (collection_id, document_id, question, answer, sources_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(collectionId, documentId, question, answer, JSON.stringify(sources ?? []));

  const row = db
    .prepare("SELECT * FROM answers WHERE id = ?")
    .get(info.lastInsertRowid);
  return { ...row, sources: parseSources(row.sources_json) };
}

/**
 * Kaydedilmiş cevapları listeler (en yeni önce). collectionId verilirse filtreler.
 * sources_json otomatik parse edilip `sources` alanına eklenir.
 * @param {number} [collectionId]
 * @returns {Array<object>}
 */
function listAnswers(collectionId) {
  const rows =
    collectionId != null
      ? db
          .prepare(
            "SELECT * FROM answers WHERE collection_id = ? ORDER BY created_at DESC, id DESC"
          )
          .all(collectionId)
      : db
          .prepare("SELECT * FROM answers ORDER BY created_at DESC, id DESC")
          .all();

  return rows.map((r) => ({ ...r, sources: parseSources(r.sources_json) }));
}

/* ------------------------------- helpers ------------------------------- */

function parseSources(json) {
  if (!json) return [];
  try {
    return JSON.parse(json);
  } catch {
    return [];
  }
}

module.exports = {
  db,
  init,
  DB_PATH,
  // collections
  createCollection,
  listCollections,
  listCollectionsWithStats,
  getCollection,
  deleteCollection,
  // documents
  addDocument,
  listDocuments,
  getDocument,
  getDocumentByFilename,
  updateDocumentChunks,
  deleteDocument,
  saveEvaluationRun,
  getEvaluationRun,
  listEvaluationRuns,
  saveReproducibilityRun,
  listReproducibilityRuns,
  // answers
  saveAnswer,
  listAnswers,
};
}
