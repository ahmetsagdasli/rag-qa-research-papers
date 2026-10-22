// server/src/evaluation-runner.js
// Bir evaluation dataset'ini baştan sona çalıştırır (retrieval + citation + opsiyonel faithfulness).
// jobs.js hem Redis worker'dan hem de in-memory job fallback'inden bu fonksiyonu çağırır.

const { randomUUID } = require("crypto");
const { retrieveWithMode } = require("./retriever");
const { citationMetrics, retrievalMetrics } = require("./evaluation");
const { judgeFaithfulness } = require("./faithfulness");
const { metadata: experimentMetadata } = require("./experiment-metadata");
const evaluationDatasets = require("./evaluation-datasets");
const db = require("./db");

async function runEvaluation(
  { datasetId, retrievalMode = "hybrid", topK = 4, scope = null, includeFaithfulness = false, chunking } = {},
  onProgress = () => {}
) {
  const dataset = evaluationDatasets.readDataset(datasetId);
  if (!dataset) throw Object.assign(new Error("evaluation dataset not found"), { status: 404 });
  if (!dataset.valid) throw Object.assign(new Error("evaluation dataset is invalid"), { status: 422, report: dataset });

  const finalTopK = Math.max(1, Math.min(100, Number(topK) || 4));
  const started = Date.now();
  const rankings = {};
  const citations = [];
  const faithfulness = [];
  const total = dataset.items.length;

  for (let i = 0; i < total; i++) {
    const item = dataset.items[i];
    onProgress(`Evaluating ${i + 1}/${total}`, Math.round((i / Math.max(1, total)) * 100));
    const hits = (await retrieveWithMode(item.question, { mode: retrievalMode, topN: finalTopK, scope })).hits;
    rankings[item.question_id] = hits.map((hit) => hit.id);
    citations.push(citationMetrics(rankings[item.question_id], item.relevant_chunk_ids || []));
    if (includeFaithfulness && item.reference_answer) {
      const judgedAt = Date.now();
      const judgment = await judgeFaithfulness({ answer: item.reference_answer, contexts: hits.map((hit) => hit.text) });
      faithfulness.push({ questionId: item.question_id, ...judgment, latencyMs: Date.now() - judgedAt });
    }
  }

  const average = (field) =>
    citations.length ? citations.reduce((sum, value) => sum + (value[field] || 0), 0) / citations.length : 0;

  const metrics = {
    retrieval: retrievalMetrics(dataset.items, rankings, finalTopK),
    citations: { citationValidity: average("citationValidity"), citationCoverage: average("citationCoverage") },
    faithfulness,
    latencyMs: Date.now() - started,
    rankings,
  };

  onProgress("Saving results", 100);
  return db.saveEvaluationRun({
    id: randomUUID(),
    datasetId,
    datasetVersion: dataset.version,
    config: { retrievalMode, topK: finalTopK, scope, includeFaithfulness, experiment: experimentMetadata({ chunking }) },
    metrics,
  });
}

module.exports = { runEvaluation };
