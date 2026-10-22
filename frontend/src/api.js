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

export async function deleteDocument(id) {
  const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
  return jsonOrThrow(res, 'Failed to delete document');
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

  // Reindex is a background job so uploads do not risk a proxy timeout.
  const indexResponse = await fetch(`/api/collections/${collectionId}/reindex`, { method: 'POST' });
  if (!indexResponse.ok) {
    const body = await indexResponse.json().catch(() => null);
    throw new Error(body?.error || 'Index rebuild failed');
  }
  const { job } = await indexResponse.json();
  if (!job?.id) throw new Error('Index job was not created');

  const poll = setInterval(async () => {
    try {
      const r = await fetch(`/api/jobs/${job.id}`);
      if (r.ok) {
        const { job: current } = await r.json();
        if (current.progress > 30) onProgress?.(current.progress, current.step);
      }
    } catch { /* ignore */ }
  }, 300);

  try {
    let current = job;
    while (current.status === 'queued' || current.status === 'processing') {
      await new Promise((resolve) => setTimeout(resolve, 500));
      const statusResponse = await fetch(`/api/jobs/${job.id}`);
      if (!statusResponse.ok) throw new Error('Could not read indexing progress');
      ({ job: current } = await statusResponse.json());
      onProgress?.(current.progress, current.step);
    }
    if (current.status !== 'completed') throw new Error(current.error || 'Index rebuild failed');
    onProgress?.(100, 'Done! Ready for questions.');
    return current.result;
  } catch (e) {
    throw e;
  } finally {
    clearInterval(poll);
  }
}

/* ------------------------------- ask ------------------------------- */

export async function ask(question, { collectionId = null, topK = 4, scope = null, retrievalMode = 'semantic', queryTransformation = 'none' } = {}) {
  const res = await fetch('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, topK, collectionId, scope, retrievalMode, queryTransformation }),
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

export async function listEvaluations() {
  const res = await fetch('/api/evaluations');
  return jsonOrThrow(res, 'Failed to load evaluations');
}
export async function listEvaluationDatasets() { const res=await fetch('/api/evaluation-datasets'); return jsonOrThrow(res,'Failed to load evaluation datasets'); }
// Evaluation büyük dataset'lerde dakikalar sürebilir; backend bunu background job olarak çalıştırır, burada pollanır.
export async function createEvaluation(payload, onProgress) {
  const res = await fetch('/api/evaluations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Evaluation failed');
  let current = body?.job;
  if (!current?.id) throw new Error('Evaluation job was not created');
  while (current.status === 'queued' || current.status === 'processing') {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const statusRes = await fetch(`/api/evaluation-jobs/${current.id}`);
    if (!statusRes.ok) throw new Error('Could not read evaluation progress');
    ({ job: current } = await statusRes.json());
    onProgress?.(current.progress, current.step);
  }
  if (current.status !== 'completed') throw new Error(current.error || 'Evaluation failed');
  return current.result;
}
export async function repeatEvaluation(id, repeats = 3) { const res=await fetch(`/api/evaluations/${id}/repeat`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repeats})}); return jsonOrThrow(res,'Reproducibility run failed'); }
export async function listReproducibility(id) { const res=await fetch(`/api/evaluations/${id}/reproducibility`); return jsonOrThrow(res,'Failed to load reproducibility results'); }

// Rebuild makes one LLM call per chunk and can take minutes on a real collection;
// backend runs it as a background job, polled here just like evaluations.
export async function rebuildGraph(collectionId, onProgress) {
  const res = await fetch(`/api/graph-retrieval/collections/${collectionId}/rebuild`, { method: 'POST' });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error || 'Graph rebuild failed');
  let current = body?.job;
  if (!current?.id) throw new Error('Graph rebuild job was not created');
  while (current.status === 'queued' || current.status === 'processing') {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const statusRes = await fetch(`/api/graph-retrieval/jobs/${current.id}`);
    if (!statusRes.ok) throw new Error('Could not read graph rebuild progress');
    ({ job: current } = await statusRes.json());
    onProgress?.(current.progress, current.step);
  }
  if (current.status !== 'completed') throw new Error(current.error || 'Graph rebuild failed');
  return current.result;
}
export async function searchGraph(query, { collectionId = null, limit = 20 } = {}) {
  const res = await fetch('/api/graph-retrieval/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, collectionId, limit }) });
  return jsonOrThrow(res, 'Graph search failed');
}
