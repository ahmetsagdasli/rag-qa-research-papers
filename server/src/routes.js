// server/src/routes.js
// Tüm API: koleksiyonlar (klasör), belgeler, indeksleme, soru-cevap, kayıtlı cevaplar.

const express = require("express");
const multer = require("multer");
const path = require("path");
const { retrieve, getDocumentHeads } = require("./retriever");
const { rerank } = require("./reranker");
const { answer } = require("./llm");
const { ingestCollection, collectionDir } = require("./ingest");
const db = require("./db");

const router = express.Router();

/* ----------------------------- progress ----------------------------- */
let currentProgress = { step: "", progress: 0 };
router.get("/progress", (_req, res) => res.json(currentProgress));

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
const upload = multer({ storage, fileFilter: pdfOnly });

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
    currentProgress = { step: "Starting processing...", progress: 35 };
    const result = await ingestCollection(collectionId, (step, progress) => {
      currentProgress = { step, progress };
    });
    currentProgress = { step: "Processing completed! Ready for questions.", progress: 100 };
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("reindex error:", e);
    currentProgress = { step: "Error occurred", progress: 0 };
    return res.status(500).json({ ok: false, error: "error during indexing" });
  }
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
    const { question, topK, collectionId = null, scope = null } = req.body || {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ ok: false, error: "question is required" });
    }

    const searchScope = buildScope({ scope, collectionId });
    const finalK = Number(topK) || FINAL_TOP_K;
    const topN = Math.max(RETRIEVE_TOP_N, finalK);

    // 1. aşama: vektör araması ile top-N aday (scope ile filtrelenir)
    const candidates = await retrieve(question, topN, searchScope);

    // 2. aşama: cross-encoder reranking -> top-K (kapalıysa cosine fallback)
    const { hits, reranked } = await rerank(question, candidates, finalK);

    // Final cevaba katkı veren her belgenin başlık/yazar/özet sayfasını (chunk0) garanti ekle.
    // Metadata soruları (yazar, başlık, özet) bu sayede güvenilir yanıtlanır.
    const topDocIds = [...new Set(hits.map((h) => h.documentId).filter((x) => x != null))];
    const heads = getDocumentHeads(topDocIds)
      .filter((hc) => !hits.some((h) => h.id === hc.id))
      .map((hc) => ({ ...hc, scoreType: "head", score: null }));

    // LLM bağlamı: başlık sayfaları ÖNCE (metadata için yetkili), sonra relevans hit'leri
    const contextChunks = [...heads, ...hits];

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

    return res.json({ ok: true, answer: completion, sources, reranked });
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
