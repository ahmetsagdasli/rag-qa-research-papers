// server/src/routes.js
// Tüm API: koleksiyonlar (klasör), belgeler, indeksleme, soru-cevap, kayıtlı cevaplar.

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { retrieve, retrieveWithMode, getDocumentHeads } = require("./retriever");
const { rerank } = require("./reranker");
const { answer } = require("./llm");
const { ingestCollection, collectionDir } = require("./ingest");
const db = require("./db");
const { startIndexJob, getJob, startEvaluationJob, getEvaluationJob, startGraphRebuildJob, getGraphRebuildJob, publicJob } = require("./jobs");
const { transform, MODES } = require("./query-transform");
const { reciprocalRankFusion } = require("./bm25");
const evaluationDatasets = require("./evaluation-datasets");
const { retrieveGraphEvidence } = require("./graph-retrieval");
const { stability } = require("./reproducibility");
const vectorStore = require("./vector-store");
const { randomUUID } = require("crypto");

const router = express.Router();

// Dış servis hatalarını arayüzde eyleme dönük, güvenli mesajlara çevir.
// Ham hata bazen anahtar veya istek ayrıntıları içerebilir; istemciye iletmiyoruz.
function publicIndexingError(error) {
  const status = error?.status || error?.statusCode;
  if (status === 401 || /incorrect api key|invalid api key|authentication/i.test(error?.message || "")) {
    return {
      status: 401,
      message: "OpenAI API key is invalid or expired. Update OPENAI_API_KEY in server/.env and restart the backend.",
    };
  }
  if (status === 429) {
    return {
      status: 429,
      message: "OpenAI rate limit or quota was reached. Check the account quota and try again shortly.",
    };
  }
  return { status: 500, message: "Indexing failed. Check the backend log and try again." };
}

function publicEvaluationError(error) {
  if (error?.status === 404) return { status: 404, message: "Evaluation dataset not found." };
  if (error?.status === 422) return { status: 422, message: "Evaluation dataset is invalid." };
  const status = error?.status || error?.statusCode;
  if (status === 401 || /incorrect api key|invalid api key|authentication/i.test(error?.message || "")) {
    return {
      status: 401,
      message: "OpenAI API key is invalid or expired. Update OPENAI_API_KEY in server/.env and restart the backend.",
    };
  }
  if (status === 429) {
    return {
      status: 429,
      message: "OpenAI rate limit or quota was reached. Check the account quota and try again shortly.",
    };
  }
  return { status: 500, message: "Evaluation failed. Check the backend log and try again." };
}

function publicGraphError(error) {
  const status = error?.status || error?.statusCode;
  if (status === 401 || /incorrect api key|invalid api key|authentication/i.test(error?.message || "")) {
    return {
      status: 401,
      message: "OpenAI API key is invalid or expired. Update OPENAI_API_KEY in server/.env and restart the backend.",
    };
  }
  if (status === 429) {
    return {
      status: 429,
      message: "OpenAI rate limit or quota was reached. Check the account quota and try again shortly.",
    };
  }
  return { status: 500, message: "Graph rebuild failed. Check the backend log and try again." };
}

function publicInspector(inspector) {
  const expose = (items = []) => items.map(({ vector, text, ...chunk }) => ({ ...chunk, preview: text?.slice(0, 300) || "" }));
  return { mode: inspector.mode, dense: expose(inspector.dense), bm25: expose(inspector.bm25), fused: expose(inspector.fused) };
}

/* ----------------------------- multer ------------------------------- */
// Dosya, URL'deki :id koleksiyonunun klasörüne kaydedilir.
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      cb(null, collectionDir(Number(req.params.id)));
    } catch (e) {
      cb(e);
    }
  },
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-]+/g, "_");
    cb(null, safe);
  },
});
function pdfOnly(_req, file, cb) {
  const ok =
    file.mimetype === "application/pdf" ||
    file.originalname.toLowerCase().endsWith(".pdf");
  cb(ok ? null : new Error("Only PDF files are accepted."), ok);
}
const upload = multer({
  storage,
  fileFilter: pdfOnly,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
});

/* --------------------------- collections ---------------------------- */

// Klasörleri belge/cevap sayılarıyla listele
router.get("/collections", (_req, res) => {
  try {
    return res.json({ ok: true, collections: db.listCollectionsWithStats() });
  } catch (e) {
    console.error("collections list error:", e);
    return res.status(500).json({ ok: false, error: "could not list collections" });
  }
});

// Yeni klasör oluştur
router.post("/collections", (req, res) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ ok: false, error: "name is required" });
    const collection = db.createCollection(name);
    return res.json({ ok: true, collection });
  } catch (e) {
    console.error("collection create error:", e);
    return res.status(500).json({ ok: false, error: "could not create collection" });
  }
});

// Klasörü sil
router.delete("/collections/:id", (req, res) => {
  try {
    db.deleteCollection(Number(req.params.id));
    return res.json({ ok: true });
  } catch (e) {
    console.error("collection delete error:", e);
    return res.status(500).json({ ok: false, error: "could not delete collection" });
  }
});

/* ---------------------------- documents ----------------------------- */

// Klasördeki belgeleri listele
router.get("/collections/:id/documents", (req, res) => {
  try {
    return res.json({ ok: true, documents: db.listDocuments(Number(req.params.id)) });
  } catch (e) {
    console.error("documents list error:", e);
    return res.status(500).json({ ok: false, error: "could not list documents" });
  }
});

router.delete("/documents/:id", async (req, res) => {
  try {
    const document = db.getDocument(Number(req.params.id));
    if (!document) return res.status(404).json({ ok: false, error: "Document not found" });
    const filePath = path.join(collectionDir(document.collection_id), document.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    db.deleteDocument(document.id);
    const job = await startIndexJob(document.collection_id);
    return res.status(202).json({ ok: true, job: publicJob(job, publicIndexingError) });
  } catch (e) {
    console.error("document delete error:", e);
    return res.status(500).json({ ok: false, error: "Could not delete document" });
  }
});

// Klasöre PDF yükle (kayıt DB'ye eklenir, henüz indekslenmez)
router.post("/collections/:id/documents", upload.single("file"), (req, res) => {
  try {
    const collectionId = Number(req.params.id);
    // Klasör gerçekten var mı? (silinmiş/eski bir klasöre yükleme -> net hata)
    if (!db.getCollection(collectionId)) {
      return res.status(404).json({
        ok: false,
        error: "Folder not found — it may have been deleted. Please refresh the page.",
      });
    }
    if (!req.file) return res.status(400).json({ ok: false, error: "No file uploaded" });
    const document = db.addDocument({
      collectionId,
      filename: req.file.filename,
      originalName: req.file.originalname,
      chunkCount: 0,
    });
    return res.json({ ok: true, document });
  } catch (e) {
    console.error("upload error:", e);
    return res.status(500).json({ ok: false, error: "error during upload" });
  }
});

// Klasörü yeniden indeksle (embedding üret)
router.post("/collections/:id/reindex", async (req, res) => {
  try {
    const collectionId = Number(req.params.id);
    if (!db.getCollection(collectionId)) {
      return res.status(404).json({
        ok: false,
        error: "Folder not found — it may have been deleted. Please refresh the page.",
      });
    }
    const job = await startIndexJob(collectionId, { chunking: req.body?.chunking });
    return res.status(202).json({ ok: true, job: publicJob(job, publicIndexingError) });
  } catch (e) {
    console.error("reindex error:", e);
    const publicError = publicIndexingError(e);
    return res.status(publicError.status).json({ ok: false, error: publicError.message });
  }
});

router.get("/jobs/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "Job not found" });
  return res.json({ ok: true, job: publicJob(job, publicIndexingError) });
});

router.get("/retrieval/modes", (_req, res) => res.json({ ok: true, modes: ["semantic", "bm25", "hybrid"], defaults: { denseCandidates: 20, bm25Candidates: 20, finalTopK: 4, rrfConstant: 60 } }));

router.get("/evaluation-datasets", (_req, res) => {
  try { return res.json({ ok: true, datasets: evaluationDatasets.listDatasets() }); }
  catch (error) { console.error("dataset list error:", error); return res.status(500).json({ ok: false, error: "could not list evaluation datasets" }); }
});
router.get("/evaluation-datasets/:id", (req, res) => {
  try { const dataset=evaluationDatasets.readDataset(req.params.id); if(!dataset) return res.status(404).json({ ok:false,error:"evaluation dataset not found" }); return res.json({ ok:true,dataset }); }
  catch (error) { return res.status(400).json({ ok:false,error:error.message }); }
});
router.post("/evaluation-datasets/validate", (req, res) => {
  const jsonl=req.body?.jsonl; if(typeof jsonl!=="string") return res.status(400).json({ok:false,error:"jsonl is required"});
  return res.json({ ok:true, report:evaluationDatasets.inspectJsonl(jsonl) });
});
router.post("/evaluation-datasets", (req, res) => {
  try { const { id, jsonl }=req.body||{}; const report=evaluationDatasets.saveDataset(id,jsonl); if(!report.valid) return res.status(422).json({ok:false,report}); return res.status(201).json({ok:true,dataset:report}); }
  catch (error) { return res.status(400).json({ok:false,error:error.message}); }
});

router.get("/evaluations", (_req, res) => res.json({ ok: true, evaluations: db.listEvaluationRuns() }));
router.get("/evaluations/:id", (req, res) => { const evaluation=db.getEvaluationRun(req.params.id); return evaluation ? res.json({ok:true,evaluation}) : res.status(404).json({ok:false,error:"evaluation not found"}); });
router.get("/evaluations/:id/reproducibility", (req,res)=>res.json({ok:true,runs:db.listReproducibilityRuns(req.params.id)}));
router.post("/evaluations/:id/repeat", async (req,res)=>{ try { const evaluation=db.getEvaluationRun(req.params.id); if(!evaluation)return res.status(404).json({ok:false,error:"evaluation not found"}); const repeats=Math.min(20,Math.max(2,Number(req.body?.repeats)||3)); const dataset=evaluationDatasets.readDataset(evaluation.dataset_id); if(!dataset?.valid)return res.status(422).json({ok:false,error:"dataset unavailable or invalid"}); const rankings=[]; for(let i=0;i<repeats;i++){const ranking=[];for(const item of dataset.items){const hits=(await retrieveWithMode(item.question,{mode:evaluation.config.retrievalMode,topN:evaluation.config.topK,scope:buildScope({scope:evaluation.config.scope})})).hits;ranking.push(hits.map(h=>h.id).join("|"));}rankings.push(ranking.flatMap(x=>x.split("|").filter(Boolean)));} const result=stability(rankings); const saved=db.saveReproducibilityRun({id:randomUUID(),evaluationId:evaluation.id,repeats,result}); return res.status(201).json({ok:true,reproducibility:saved}); }catch(error){console.error(error);return res.status(500).json({ok:false,error:"reproducibility run failed"});} });
// Evaluation bir dataset'teki her soru için retrieval (+opsiyonel LLM faithfulness judgment) çalıştırır;
// büyük dataset'lerde dakikalar sürebilir, bu yüzden indexing ile aynı async job pattern'i kullanılır.
router.post("/evaluations", async (req, res) => {
  try {
    const { datasetId, retrievalMode = "hybrid", topK = 4, scope = null, includeFaithfulness = false, chunking } = req.body || {};
    if (!["semantic", "bm25", "hybrid"].includes(retrievalMode)) return res.status(400).json({ ok: false, error: "invalid retrieval mode" });
    const dataset = evaluationDatasets.readDataset(datasetId);
    if (!dataset) return res.status(404).json({ ok: false, error: "evaluation dataset not found" });
    if (!dataset.valid) return res.status(422).json({ ok: false, error: "evaluation dataset is invalid", report: dataset });
    const job = await startEvaluationJob({ datasetId, retrievalMode, topK, scope: buildScope({ scope }), includeFaithfulness, chunking });
    return res.status(202).json({ ok: true, job: publicJob(job, publicEvaluationError) });
  } catch (error) {
    console.error("evaluation job error:", error);
    return res.status(500).json({ ok: false, error: "could not start evaluation" });
  }
});

router.get("/evaluation-jobs/:id", async (req, res) => {
  const job = await getEvaluationJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "Evaluation job not found" });
  return res.json({ ok: true, job: publicJob(job, publicEvaluationError) });
});

router.post("/retrieval/search", async (req, res) => {
  try {
    const { question, mode = "hybrid", scope = null, topN = 20 } = req.body || {};
    if (typeof question !== "string" || !question.trim()) return res.status(400).json({ ok: false, error: "question is required" });
    if (!["semantic", "bm25", "hybrid"].includes(mode)) return res.status(400).json({ ok: false, error: "invalid retrieval mode" });
    const started = Date.now();
    const result = await retrieveWithMode(question, { mode, topN: Math.min(100, Math.max(1, Number(topN) || 20)), scope: buildScope({ scope }) });
    return res.json({ ok: true, hits: publicInspector({ mode, dense: result.hits }).dense, inspector: publicInspector(result.inspector), latencyMs: Date.now() - started });
  } catch (e) {
    console.error("retrieval search error:", e);
    return res.status(500).json({ ok: false, error: "retrieval search failed" });
  }
});
router.post("/graph-retrieval/search", async (req, res) => {
  try {
    const { query, collectionId = null, limit = 20 } = req.body || {};
    if (typeof query !== "string" || !query.trim()) return res.status(400).json({ ok: false, error: "query is required" });
    return res.json({ ok: true, experimental: true, evidence: await retrieveGraphEvidence(query, { collectionId, limit }) });
  } catch (error) { return res.status(503).json({ ok: false, error: error.message }); }
});
// Rebuild extracts entities/relations with one LLM call per chunk, so a real collection can take
// minutes; it runs as a background job (same pattern as indexing/evaluations) instead of inline.
router.post("/graph-retrieval/collections/:id/rebuild", async (req, res) => {
  try {
    if (!vectorStore.enabled()) return res.status(503).json({ ok: false, error: "Experimental Graph Retrieval requires DATABASE_URL" });
    const job = await startGraphRebuildJob(Number(req.params.id));
    return res.status(202).json({ ok: true, experimental: true, job: publicJob(job, publicGraphError) });
  } catch (error) {
    console.error("graph rebuild job error:", error);
    return res.status(500).json({ ok: false, error: "could not start graph rebuild" });
  }
});
router.get("/graph-retrieval/jobs/:id", async (req, res) => {
  const job = await getGraphRebuildJob(req.params.id);
  if (!job) return res.status(404).json({ ok: false, error: "Graph rebuild job not found" });
  return res.json({ ok: true, experimental: true, job: publicJob(job, publicGraphError) });
});

/* ------------------------------- ask -------------------------------- */

// İki aşamalı retrieval ayarları (.env'den)
const RETRIEVE_TOP_N = parseInt(process.env.RETRIEVE_TOP_N || "20", 10); // 1. aşama aday sayısı
const FINAL_TOP_K = parseInt(process.env.FINAL_TOP_K || "4", 10); // 2. aşama (LLM'e giden) sayı

// Gelen body'den arama kapsamını (scope) normalize et.
// Öncelik: açıkça verilen scope (collectionIds/documentIds) > eski collectionId > tümü.
function buildScope({ scope, collectionId }) {
  const colIds = (scope?.collectionIds || []).map(Number).filter((n) => !Number.isNaN(n));
  const docIds = (scope?.documentIds || []).map(Number).filter((n) => !Number.isNaN(n));
  if (colIds.length || docIds.length) {
    return { collectionIds: colIds, documentIds: docIds };
  }
  if (collectionId != null) {
    return { collectionIds: [Number(collectionId)], documentIds: [] };
  }
  return null; // tümü (geriye dönük uyumlu)
}

router.post("/ask", async (req, res) => {
  try {
    const { question, topK, collectionId = null, scope = null, retrievalMode = "semantic", queryTransformation = "none" } = req.body || {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ ok: false, error: "question is required" });
    }

    const searchScope = buildScope({ scope, collectionId });
    const finalK = Number(topK) || FINAL_TOP_K;
    const topN = Math.max(RETRIEVE_TOP_N, finalK);

    // 1. aşama: vektör araması ile top-N aday (scope ile filtrelenir)
    if (!["semantic", "bm25", "hybrid"].includes(retrievalMode)) return res.status(400).json({ ok: false, error: "invalid retrieval mode" });
    if (!MODES.includes(queryTransformation)) return res.status(400).json({ ok: false, error: "invalid query transformation mode" });
    const retrievalStarted = Date.now();
    const transformation = await transform(question, queryTransformation);
    const retrievals = await Promise.all(transformation.queries.map((query) => retrieveWithMode(query, { mode: retrievalMode, topN, scope: searchScope })));
    const retrieval = retrievals[0];
    const candidates = retrievals.length === 1 ? retrieval.hits : reciprocalRankFusion(retrievals.map((item) => item.hits)).slice(0, topN);

    // 2. aşama: cross-encoder reranking -> top-K (kapalıysa cosine fallback)
    const rerankStarted = Date.now();
    const { hits, reranked } = await rerank(question, candidates, finalK);

    // Final cevaba katkı veren her belgenin başlık/yazar/özet sayfasını (chunk0) garanti ekle.
    // Metadata soruları (yazar, başlık, özet) bu sayede güvenilir yanıtlanır.
    const topDocIds = [...new Set(hits.map((h) => h.documentId).filter((x) => x != null))];
    const heads = getDocumentHeads(topDocIds)
      .filter((hc) => !hits.some((h) => h.id === hc.id))
      .map((hc) => ({ ...hc, scoreType: "head", score: null }));

    // LLM bağlamı: başlık sayfaları ÖNCE (metadata için yetkili), sonra relevans hit'leri
    const contextChunks = [...heads, ...hits];

    const answerStarted = Date.now();
    const completion = await answer(
      question,
      contextChunks.map((h) => ({
        text: h.text,
        source: h.source,
        chunkIndex: h.chunkIndex,
        isHead: h.scoreType === "head",
      }))
    );

    // Kaynaklara klasör adını ekle (hangi belge + hangi klasör görünsün)
    const colMap = new Map(db.listCollections().map((c) => [c.id, c.name]));

    // Görüntüde: relevans hit'leri önce, başlık sayfaları sonda
    const sources = [...hits, ...heads].map((h) => ({
      id: h.id,
      docId: h.docId,
      documentId: h.documentId ?? null,
      collectionId: h.collectionId ?? null,
      collectionName: colMap.get(h.collectionId) || null,
      chunkIndex: h.chunkIndex,
      source: h.source,
      score: typeof h.score === "number" ? Number(h.score.toFixed(4)) : null,
      scoreType: h.scoreType || "cosine", // 'rerank' | 'cosine' | 'head'
      preview: h.text.slice(0, 300),
    }));

    return res.json({ ok: true, answer: completion, sources, reranked, inspector: { ...publicInspector(retrieval.inspector), retrievalMode, originalQuestion: question, queryTransformation, transformedQueries: transformation.queries, subquestions: transformation.subquestions, retrievalLatencyMs: rerankStarted - retrievalStarted, rerankingLatencyMs: answerStarted - rerankStarted, answerLatencyMs: Date.now() - answerStarted, finalChunkIds: contextChunks.map((chunk) => chunk.id) } });
  } catch (e) {
    console.error("ask error:", e);
    return res.status(500).json({ ok: false, error: "error occurred during ask operation" });
  }
});

// Tüm belgeleri listele (scope seçici için) — opsiyonel ?collectionId filtresi
router.get("/documents", (req, res) => {
  try {
    const cid = req.query.collectionId != null ? Number(req.query.collectionId) : undefined;
    return res.json({ ok: true, documents: db.listDocuments(cid) });
  } catch (e) {
    console.error("documents list error:", e);
    return res.status(500).json({ ok: false, error: "could not list documents" });
  }
});

/* ----------------------------- answers ------------------------------ */

// Kayıtlı cevapları listele (bir klasöre ait)
router.get("/collections/:id/answers", (req, res) => {
  try {
    return res.json({ ok: true, answers: db.listAnswers(Number(req.params.id)) });
  } catch (e) {
    console.error("answers list error:", e);
    return res.status(500).json({ ok: false, error: "could not list answers" });
  }
});

// Bir cevabı klasöre kaydet (frontend'deki "Kaydet" butonu)
router.post("/answers", (req, res) => {
  try {
    const { collectionId, documentId = null, question, answer: answerText, sources = [] } = req.body || {};
    if (!question || !answerText) {
      return res.status(400).json({ ok: false, error: "question and answer are required" });
    }
    const saved = db.saveAnswer({
      collectionId: collectionId != null ? Number(collectionId) : null,
      documentId: documentId != null ? Number(documentId) : null,
      question,
      answer: answerText,
      sources,
    });
    return res.json({ ok: true, answer: saved });
  } catch (e) {
    console.error("save answer error:", e);
    return res.status(500).json({ ok: false, error: "could not save answer" });
  }
});

module.exports = router;
