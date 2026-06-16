// server/src/reranker.js
// İki aşamalı retrieval'ın 2. aşaması: cross-encoder reranking (Cohere Rerank API).
//
// - USE_RERANKER=false  veya  COHERE_API_KEY yoksa  -> reranking atlanır,
//   adaylar cosine sırasıyla ilk K döndürülür (graceful fallback, hata yok).
// - Cohere çağrısı hata verirse de aynı fallback uygulanır (throw yok).

const COHERE_URL = "https://api.cohere.com/v2/rerank";
const RERANK_MODEL = process.env.RERANK_MODEL || "rerank-english-v3.0";
const REQUEST_TIMEOUT_MS = parseInt(process.env.RERANK_TIMEOUT_MS || "10000", 10);

/**
 * Reranking aktif mi? (env anahtarı açık VE Cohere anahtarı mevcut)
 * @returns {boolean}
 */
function hasValidKey() {
  const key = (process.env.COHERE_API_KEY || "").trim();
  // Boş veya .env.example'daki placeholder ise "anahtar yok" say
  return key.length > 0 && key !== "your_cohere_api_key_here";
}

function isEnabled() {
  const flag = (process.env.USE_RERANKER || "true").toLowerCase() !== "false";
  return flag && hasValidKey();
}

/**
 * Fallback: adayları cosine skoruyla ilk K döndür, scoreType='cosine'.
 */
function cosineFallback(candidates, topK) {
  return candidates.slice(0, topK).map((c) => ({ ...c, scoreType: "cosine" }));
}

/**
 * N adayı cross-encoder ile yeniden sırala ve en iyi K'yı döndür.
 * @param {string} query
 * @param {Array<{text:string, score:number}>} candidates  1. aşamadan gelen adaylar
 * @param {number} topK  LLM'e verilecek nihai sayı
 * @returns {Promise<{hits:Array, reranked:boolean}>}
 */
async function rerank(query, candidates, topK = 4) {
  if (!candidates || candidates.length === 0) {
    return { hits: [], reranked: false };
  }

  // Reranking kapalı / anahtar yok -> eski tek-aşamalı davranış
  if (!isEnabled()) {
    return { hits: cosineFallback(candidates, topK), reranked: false };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const res = await fetch(COHERE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: RERANK_MODEL,
        query,
        documents: candidates.map((c) => c.text),
        top_n: Math.min(topK, candidates.length),
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(`⚠️  Reranker disabled for this query (Cohere ${res.status}): ${detail.slice(0, 200)}`);
      return { hits: cosineFallback(candidates, topK), reranked: false };
    }

    const data = await res.json();
    // data.results: [{ index, relevance_score }] (en alakalıdan az alakalıya)
    const hits = (data.results || []).map((r) => ({
      ...candidates[r.index],
      score: r.relevance_score, // 0-1 arası cross-encoder relevance skoru
      scoreType: "rerank",
    }));

    return { hits, reranked: true };
  } catch (e) {
    console.warn("⚠️  Reranker error, falling back to cosine:", e.message);
    return { hits: cosineFallback(candidates, topK), reranked: false };
  }
}

module.exports = {
  rerank,
  isEnabled,
};
