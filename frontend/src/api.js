// frontend/src/api.js — collection (klasör) tabanlı API istemcisi

async function jsonOrThrow(res, msg) {
  if (!res.ok) throw new Error(msg);
  return res.json();
}

/* --------------------------- collections --------------------------- */

export async function listCollections() {
  const res = await fetch('/api/collections');
  return jsonOrThrow(res, 'Failed to load folders');
}

export async function createCollection(name) {
  const res = await fetch('/api/collections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return jsonOrThrow(res, 'Failed to create folder');
}

export async function deleteCollection(id) {
  const res = await fetch(`/api/collections/${id}`, { method: 'DELETE' });
  return jsonOrThrow(res, 'Failed to delete folder');
}

/* ---------------------------- documents ---------------------------- */

export async function listDocuments(collectionId) {
  const res = await fetch(`/api/collections/${collectionId}/documents`);
  return jsonOrThrow(res, 'Failed to load documents');
}

// Tüm belgeler (scope seçici için) — opsiyonel collectionId filtresi
export async function listAllDocuments() {
  const res = await fetch('/api/documents');
  return jsonOrThrow(res, 'Failed to load documents');
}

// PDF'leri bir klasöre yükle, ardından klasörü yeniden indeksle (progress ile)
export async function uploadAndIndex(collectionId, files, onProgress) {
  const total = files.length;
  onProgress?.(0, 'Starting upload...');

  for (let i = 0; i < files.length; i++) {
    const fd = new FormData();
    fd.append('file', files[i]);
    onProgress?.(Math.round(((i + 1) / total) * 30), `Uploading ${files[i].name}...`);
    const res = await fetch(`/api/collections/${collectionId}/documents`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) {
      const msg = await res.json().then((d) => d.error).catch(() => null);
      throw new Error(msg || `Upload failed for ${files[i].name}`);
    }
  }

  onProgress?.(30, 'Files uploaded, building index...');

  // Reindex + progress polling
  const indexPromise = fetch(`/api/collections/${collectionId}/reindex`, { method: 'POST' });
  const poll = setInterval(async () => {
    try {
      const r = await fetch('/api/progress');
      if (r.ok) {
        const { step, progress } = await r.json();
        if (progress > 30) onProgress?.(progress, step);
      }
    } catch { /* ignore */ }
  }, 300);

  try {
    const res = await indexPromise;
    clearInterval(poll);
    if (!res.ok) throw new Error('Index rebuild failed');
    const result = await res.json();
    onProgress?.(100, 'Done! Ready for questions.');
    return result;
  } catch (e) {
    clearInterval(poll);
    throw e;
  }
}

/* ------------------------------- ask ------------------------------- */

export async function ask(question, { collectionId = null, topK = 4, scope = null } = {}) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, topK, collectionId, scope }),
  });
  return jsonOrThrow(res, 'Ask failed');
}

/* ----------------------------- answers ----------------------------- */

export async function listAnswers(collectionId) {
  const res = await fetch(`/api/collections/${collectionId}/answers`);
  return jsonOrThrow(res, 'Failed to load saved answers');
}

export async function saveAnswer({ collectionId, question, answer, sources }) {
  const res = await fetch('/api/answers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collectionId, question, answer, sources }),
  });
  return jsonOrThrow(res, 'Failed to save answer');
}
