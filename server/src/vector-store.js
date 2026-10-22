const { Pool } = require("pg");

let pool;
function enabled() { return Boolean(process.env.DATABASE_URL); }
function getPool() {
  if (!enabled()) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  return pool;
}
function vectorLiteral(vector) { return `[${vector.map(Number).join(",")}]`; }

async function migrate() {
  const db = getPool();
  if (!db) return false;
  await db.query("CREATE EXTENSION IF NOT EXISTS vector");
  await db.query(`CREATE TABLE IF NOT EXISTS rag_chunks (
    id TEXT PRIMARY KEY, document_id BIGINT, collection_id BIGINT NOT NULL, chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL, embedding vector(1536) NOT NULL, embedding_model TEXT NOT NULL,
    content_hash TEXT NOT NULL, source_filename TEXT NOT NULL, chunking_strategy TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await db.query("CREATE INDEX IF NOT EXISTS rag_chunks_collection_idx ON rag_chunks(collection_id)");
  await db.query("CREATE INDEX IF NOT EXISTS rag_chunks_document_idx ON rag_chunks(document_id)");
  await db.query("CREATE INDEX IF NOT EXISTS rag_chunks_embedding_idx ON rag_chunks USING hnsw (embedding vector_cosine_ops)");
  await db.query("CREATE TABLE IF NOT EXISTS graph_nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT, collection_id BIGINT, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  await db.query("CREATE TABLE IF NOT EXISTS graph_edges (id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, target_id TEXT NOT NULL REFERENCES graph_nodes(id) ON DELETE CASCADE, relation TEXT NOT NULL, evidence_chunk_id TEXT REFERENCES rag_chunks(id) ON DELETE SET NULL, weight REAL NOT NULL DEFAULT 1, metadata JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT now())");
  await db.query("CREATE INDEX IF NOT EXISTS graph_nodes_collection_idx ON graph_nodes(collection_id)");
  await db.query("CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges(source_id)");
  return true;
}

async function replaceCollection(collectionId, chunks) {
  const db = getPool(); if (!db) return false;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM rag_chunks WHERE collection_id = $1", [collectionId]);
    for (const chunk of chunks) {
      if (!Array.isArray(chunk.vector) || chunk.vector.length !== 1536) throw new Error(`Invalid embedding dimension for ${chunk.id}`);
      await client.query(`INSERT INTO rag_chunks (id, document_id, collection_id, chunk_index, content, embedding, embedding_model, content_hash, source_filename, chunking_strategy, metadata)
        VALUES ($1,$2,$3,$4,$5,$6::vector,$7,$8,$9,$10,$11::jsonb)`, [chunk.id, chunk.documentId || null, chunk.collectionId, chunk.chunkIndex, String(chunk.text).replace(/\0/g, ""), vectorLiteral(chunk.vector), chunk.embeddingModel || "text-embedding-3-small", chunk.contentHash || "", String(chunk.source).replace(/\0/g, ""), chunk.chunkingStrategy || "fixed", JSON.stringify({ sectionHeading: chunk.sectionHeading ? String(chunk.sectionHeading).replace(/\0/g, "") : null })]);
    }
    await client.query("COMMIT"); return true;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}

async function listChunks(scope = null) {
  const db = getPool(); if (!db) return null;
  const clauses=[]; const params=[];
  const collections=scope?.collectionIds || [], documents=scope?.documentIds || [];
  if (collections.length || documents.length) { const parts=[]; if(collections.length){params.push(collections);parts.push(`collection_id = ANY($${params.length}::bigint[])`);} if(documents.length){params.push(documents);parts.push(`document_id = ANY($${params.length}::bigint[])`);} clauses.push(`(${parts.join(" OR ")})`); }
  const result=await db.query(`SELECT id, document_id, collection_id, chunk_index, content, source_filename, embedding_model, content_hash, chunking_strategy, metadata FROM rag_chunks ${clauses.length?`WHERE ${clauses.join(" AND ")}`:""}`,params);
  return result.rows.map((row)=>({ id:row.id, documentId:row.document_id, collectionId:row.collection_id, chunkIndex:row.chunk_index, text:row.content, source:row.source_filename, embeddingModel:row.embedding_model, contentHash:row.content_hash, chunkingStrategy:row.chunking_strategy, sectionHeading:row.metadata?.sectionHeading || null }));
}

async function searchDense(vector, scope, limit) {
  const db=getPool(); if(!db) return null;
  const chunks=await listChunks(scope); if(!chunks?.length) return [];
  const ids=chunks.map((chunk)=>chunk.id); const result=await db.query(`SELECT id, 1 - (embedding <=> $1::vector) AS score FROM rag_chunks WHERE id = ANY($2::text[]) ORDER BY embedding <=> $1::vector LIMIT $3`,[vectorLiteral(vector),ids,limit]);
  const map=new Map(chunks.map((chunk)=>[chunk.id,chunk])); return result.rows.map((row,index)=>({...map.get(row.id),score:Number(row.score),denseRank:index+1,cosineScore:Number(row.score)}));
}
async function replaceGraphCollection(collectionId, nodes, edges) {
  const db=getPool(); if(!db) throw new Error("DATABASE_URL is required"); const client=await db.connect();
  try { await client.query("BEGIN"); await client.query("DELETE FROM graph_nodes WHERE collection_id=$1",[collectionId]);
    for(const node of nodes) await client.query("INSERT INTO graph_nodes (id,name,type,collection_id,metadata) VALUES ($1,$2,$3,$4,$5::jsonb)",[node.id,node.name,node.type||null,collectionId,JSON.stringify({})]);
    for(const edge of edges) await client.query("INSERT INTO graph_edges (id,source_id,target_id,relation,evidence_chunk_id,weight,metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)",[edge.id,edge.sourceId,edge.targetId,edge.relation,edge.evidenceChunkId,1,JSON.stringify({})]);
    await client.query("COMMIT"); } catch(error){await client.query("ROLLBACK");throw error;} finally{client.release();}
}
module.exports={ enabled, getPool, migrate, replaceCollection, replaceGraphCollection, listChunks, searchDense };
