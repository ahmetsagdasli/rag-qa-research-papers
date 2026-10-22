// Persistent metadata store used by Vercel Functions.  The local SQLite
// adapter remains in db.js for development and the existing test suite.
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });
let ready;

function init() {
  if (!ready) ready = pool.query(`
    CREATE TABLE IF NOT EXISTS collections (
      id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS documents (
      id BIGSERIAL PRIMARY KEY,
      collection_id BIGINT REFERENCES collections(id) ON DELETE CASCADE,
      filename TEXT NOT NULL, original_name TEXT, blob_url TEXT,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(), chunk_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(collection_id);
    CREATE TABLE IF NOT EXISTS answers (
      id BIGSERIAL PRIMARY KEY,
      collection_id BIGINT REFERENCES collections(id) ON DELETE CASCADE,
      document_id BIGINT REFERENCES documents(id) ON DELETE SET NULL,
      question TEXT NOT NULL, answer TEXT NOT NULL, sources_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS evaluation_runs (
      id TEXT PRIMARY KEY, dataset_id TEXT NOT NULL, dataset_version TEXT NOT NULL,
      config_json JSONB NOT NULL, metrics_json JSONB NOT NULL, status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reproducibility_runs (
      id TEXT PRIMARY KEY, evaluation_id TEXT NOT NULL, repeats INTEGER NOT NULL,
      result_json JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  return ready;
}
async function q(text, values) { await init(); return pool.query(text, values); }
function one(result) { return result.rows[0]; }

async function createCollection(name) { return one(await q("INSERT INTO collections (name) VALUES ($1) RETURNING *", [name])); }
async function listCollections() { return (await q("SELECT * FROM collections ORDER BY created_at DESC, id DESC")).rows; }
async function listCollectionsWithStats() { return (await q(`SELECT c.*, (SELECT count(*)::int FROM documents d WHERE d.collection_id=c.id) AS document_count, (SELECT count(*)::int FROM answers a WHERE a.collection_id=c.id) AS answer_count FROM collections c ORDER BY c.created_at DESC, c.id DESC`)).rows; }
async function getCollection(id) { return one(await q("SELECT * FROM collections WHERE id=$1", [id])); }
async function deleteCollection(id) { await q("DELETE FROM collections WHERE id=$1", [id]); }
async function addDocument({ collectionId, filename, originalName = null, chunkCount = 0, blobUrl = null }) { return one(await q("INSERT INTO documents (collection_id,filename,original_name,blob_url,chunk_count) VALUES ($1,$2,$3,$4,$5) RETURNING *", [collectionId, filename, originalName, blobUrl, chunkCount])); }
async function listDocuments(collectionId) { return (await q(collectionId != null ? "SELECT * FROM documents WHERE collection_id=$1 ORDER BY uploaded_at DESC,id DESC" : "SELECT * FROM documents ORDER BY uploaded_at DESC,id DESC", collectionId != null ? [collectionId] : [])).rows; }
async function getDocument(id) { return one(await q("SELECT * FROM documents WHERE id=$1", [id])); }
async function getDocumentByFilename(collectionId, filename) { return one(await q("SELECT * FROM documents WHERE collection_id=$1 AND filename=$2", [collectionId, filename])); }
async function updateDocumentChunks({ collectionId, filename, chunkCount }) { await q("UPDATE documents SET chunk_count=$1 WHERE collection_id=$2 AND filename=$3", [chunkCount, collectionId, filename]); }
async function deleteDocument(id) { await q("DELETE FROM documents WHERE id=$1", [id]); }
async function saveAnswer({ collectionId = null, documentId = null, question, answer, sources = [] }) { const row=one(await q("INSERT INTO answers (collection_id,document_id,question,answer,sources_json) VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *", [collectionId,documentId,question,answer,JSON.stringify(sources)])); return { ...row, sources: row.sources_json || [] }; }
async function listAnswers(collectionId) { const rows=(await q(collectionId != null ? "SELECT * FROM answers WHERE collection_id=$1 ORDER BY created_at DESC,id DESC" : "SELECT * FROM answers ORDER BY created_at DESC,id DESC",collectionId != null?[collectionId]:[])).rows; return rows.map((row)=>({ ...row, sources: row.sources_json || [] })); }
async function saveEvaluationRun(run) { const row=one(await q("INSERT INTO evaluation_runs (id,dataset_id,dataset_version,config_json,metrics_json,status) VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6) RETURNING *",[run.id,run.datasetId,run.datasetVersion,JSON.stringify(run.config),JSON.stringify(run.metrics),run.status||"completed"])); return { ...row, config:row.config_json, metrics:row.metrics_json }; }
async function getEvaluationRun(id) { const row=one(await q("SELECT * FROM evaluation_runs WHERE id=$1",[id])); return row && { ...row, config:row.config_json, metrics:row.metrics_json }; }
async function listEvaluationRuns() { return (await q("SELECT * FROM evaluation_runs ORDER BY created_at DESC,id DESC")).rows.map((row)=>({ ...row,config:row.config_json,metrics:row.metrics_json })); }
async function saveReproducibilityRun(run) { const row=one(await q("INSERT INTO reproducibility_runs (id,evaluation_id,repeats,result_json) VALUES ($1,$2,$3,$4::jsonb) RETURNING *",[run.id,run.evaluationId,run.repeats,JSON.stringify(run.result)])); return { ...row,result:row.result_json }; }
async function listReproducibilityRuns(evaluationId) { return (await q("SELECT * FROM reproducibility_runs WHERE evaluation_id=$1 ORDER BY created_at DESC",[evaluationId])).rows.map((row)=>({ ...row,result:row.result_json })); }

module.exports={ init, createCollection, listCollections, listCollectionsWithStats, getCollection, deleteCollection, addDocument, listDocuments, getDocument, getDocumentByFilename, updateDocumentChunks, deleteDocument, saveAnswer, listAnswers, saveEvaluationRun, getEvaluationRun, listEvaluationRuns, saveReproducibilityRun, listReproducibilityRuns };
