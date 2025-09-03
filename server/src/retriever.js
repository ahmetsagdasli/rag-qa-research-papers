// server/src/retriever.js
// Soru embedding'i üretir, index.json'daki chunk vektörleriyle
// kosinüs benzerliği üzerinden Top-K geri getirir.

const OpenAI = require("openai");
const { loadIndex, cosineSim, topKScored } = require("./utils");

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding-3-small";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Metin için embedding üretir
 * @param {string} text
 * @returns {Promise<number[]>}
 */
async function embed(text) {
  const res = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return res.data[0].embedding;
}

/**
 * Soruya göre Top-K chunk döndür
 * @param {string} question
 * @param {number} k
 * @returns {Promise<Array<{id, docId, chunkIndex, text, vector, source, score}>>}
 */
async function retrieve(question, k = 6) {
  const index = loadIndex();
  if (!index.chunks || index.chunks.length === 0) {
    return [];
  }

  const qVec = await embed(question);

  const scored = index.chunks.map((c) => ({
    ...c,
    score: cosineSim(qVec, c.vector),
  }));

  return topKScored(scored, k);
}

module.exports = {
  retrieve,
  embed, // bazı durumlarda dışarıdan da lazım olabilir
};
