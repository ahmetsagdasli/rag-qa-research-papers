// server/src/routes.js
// /api/ask endpointi: retriever + llm zinciri

const express = require("express");
const { retrieve } = require("./retriever");
const { answer } = require("./llm");

const router = express.Router();

/**
 * Body:
 *  { question: string, topK?: number }
 */
router.post("/ask", async (req, res) => {
  try {
    const { question, topK = 6 } = req.body || {};
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "question is required" });
    }

    // 1) Retrieve
    const hits = await retrieve(question, topK);

    // 2) Cevap
    const completion = await answer(
      question,
      hits.map((h) => ({ text: h.text, source: h.source, chunkIndex: h.chunkIndex }))
    );

    // 3) Kaynaklar (frontend gösterimi için)
    const sources = hits.map((h) => ({
      id: h.id,
      docId: h.docId,
      chunkIndex: h.chunkIndex,
      source: h.source,
      score: Number(h.score.toFixed(4)),
      preview: h.text.slice(0, 300),
    }));

    return res.json({
      ok: true,
      answer: completion,
      sources,
    });
  } catch (e) {
    console.error("ask error:", e);
    return res.status(500).json({ ok: false, error: "error occurred during ask operation" });
  }
});

module.exports = router;
