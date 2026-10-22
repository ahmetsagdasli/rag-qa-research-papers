const K1 = 1.2;
const B = 0.75;

function tokenize(text = "") {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function rankBm25(query, chunks, limit = 20) {
  const docs = chunks.map((chunk) => ({ chunk, tokens: tokenize(chunk.text) }));
  const docCount = docs.length;
  if (!docCount) return [];
  const df = new Map();
  let totalLength = 0;
  for (const doc of docs) {
    totalLength += doc.tokens.length;
    for (const term of new Set(doc.tokens)) df.set(term, (df.get(term) || 0) + 1);
  }
  const avgLength = totalLength / docCount || 1;
  const queryTerms = tokenize(query);
  return docs.map(({ chunk, tokens }) => {
    const tf = new Map();
    for (const term of tokens) tf.set(term, (tf.get(term) || 0) + 1);
    let score = 0;
    for (const term of queryTerms) {
      const frequency = tf.get(term) || 0;
      if (!frequency) continue;
      const docFrequency = df.get(term) || 0;
      const idf = Math.log(1 + (docCount - docFrequency + 0.5) / (docFrequency + 0.5));
      score += idf * (frequency * (K1 + 1)) / (frequency + K1 * (1 - B + B * tokens.length / avgLength));
    }
    return { ...chunk, bm25Score: score };
  }).filter((item) => item.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score || a.id.localeCompare(b.id)).slice(0, limit)
    .map((item, index) => ({ ...item, bm25Rank: index + 1 }));
}

function reciprocalRankFusion(rankings, constant = 60) {
  const byId = new Map();
  for (const ranking of rankings) {
    for (let index = 0; index < ranking.length; index++) {
      const item = ranking[index];
      const previous = byId.get(item.id) || { ...item, rrfScore: 0 };
      previous.rrfScore += 1 / (constant + index + 1);
      byId.set(item.id, previous);
    }
  }
  return [...byId.values()].sort((a, b) => b.rrfScore - a.rrfScore || a.id.localeCompare(b.id))
    .map((item, index) => ({ ...item, rrfRank: index + 1 }));
}

module.exports = { K1, B, tokenize, rankBm25, reciprocalRankFusion };
