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
 * Bir chunk verilen scope içinde mi?
 * scope = { collectionIds:number[], documentIds:number[] }
 *  - ikisi de boş            -> tümü (filtre yok)
 *  - sadece documentIds      -> o belgeler
 *  - sadece collectionIds    -> o klasörlerin tüm belgeleri
 *  - ikisi birden            -> birleşim (OR)
 */
function inScope(chunk, scope) {
  if (!scope) return true;
  const collectionIds = scope.collectionIds || [];
  const documentIds = scope.documentIds || [];
  if (collectionIds.length === 0 && documentIds.length === 0) return true;
  const colMatch = collectionIds.includes(chunk.collectionId);
  const docMatch = documentIds.includes(chunk.documentId);
  return colMatch || docMatch;
}

/**
 * Soruya göre Top-K chunk döndür
 * @param {string} question
 * @param {number} k
 * @param {{collectionIds?:number[], documentIds?:number[]}|number|null} scope
 *        Geriye uyumluluk: sayı verilirse tek collectionId gibi davranır.
 * @returns {Promise<Array>}
 */
async function retrieve(question, k = 4, scope = null) {
  const index = loadIndex();
  if (!index.chunks || index.chunks.length === 0) {
    return [];
  }

  // Geriye uyumluluk: scope bir sayıysa eski collectionId davranışı
  const normScope =
    typeof scope === "number" ? { collectionIds: [scope], documentIds: [] } : scope;

  const pool = normScope
    ? index.chunks.filter((c) => inScope(c, normScope))
    : index.chunks;

  if (pool.length === 0) return [];

  const qVec = await embed(question);

  const scored = pool.map((c) => ({
    ...c,
    score: cosineSim(qVec, c.vector),
  }));

  return topKScored(scored, k);
}

/**
 * Verilen belgelerin ilk chunk'ını (chunkIndex 0 = başlık/yazar/özet sayfası) döndürür.
 * Metadata soruları (yazar/başlık/özet) semantik aramayla zor bulunduğu için
 * bu chunk'lar bağlama garanti eklenir.
 * @param {number[]} documentIds
 * @returns {Array}
 */
function getDocumentHeads(documentIds) {
  if (!documentIds || documentIds.length === 0) return [];
  const index = loadIndex();
  const wanted = new Set(documentIds);
  return (index.chunks || []).filter(
    (c) => c.chunkIndex === 0 && wanted.has(c.documentId)
  );
}

module.exports = {
  retrieve,
  getDocumentHeads,
  embed, // bazı durumlarda dışarıdan da lazım olabilir
};
