// server/src/utils.js
// Basit yardımcı fonksiyonlar

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

// Güvenli JSON yükleme
function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) {
    return { version: 1, chunks: [], docs: {} };
  }
  const raw = fs.readFileSync(INDEX_PATH, "utf-8");
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("index.json okunamadı:", e);
    return { version: 1, chunks: [], docs: {} };
  }
}

// Kosinüs benzerliği
function cosineSim(a, b) {
  let dot = 0.0, na = 0.0, nb = 0.0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

// Top-K seç
function topKScored(items, k) {
  const arr = [...items].sort((x, y) => y.score - x.score);
  return arr.slice(0, k);
}

module.exports = {
  DATA_DIR,
  INDEX_PATH,
  loadIndex,
  cosineSim,
  topKScored,
};
