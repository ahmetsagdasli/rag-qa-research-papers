const test = require("node:test");
const assert = require("node:assert/strict");
const { chunkText } = require("../src/ingest");
const { cosineSim, topKScored } = require("../src/utils");
const { rankBm25, reciprocalRankFusion } = require("../src/bm25");
const { retrievalMetrics, answerMetrics, citationMetrics } = require("../src/evaluation");
const { parseQueryList } = require("../src/query-transform");
const { jaccard, kendallTau, stability } = require("../src/reproducibility");
const { estimateCost } = require("../src/experiment-metadata");
const { metadata } = require("../src/experiment-metadata");
const db = require("../src/db");
const { randomUUID } = require("crypto");
const { inspectJsonl, saveDataset, readDataset } = require("../src/evaluation-datasets");
const fs = require("fs"); const os = require("os"); const path = require("path");

test("chunkText preserves text with overlap", () => {
  assert.deepEqual(chunkText("abcdefghij", 5, 2), ["abcde", "defgh", "ghij"]);
});

test("query transformation parser accepts only distinct string queries", () => {
  assert.deepEqual(parseQueryList('["one", "one", 2, "two"]', 3), ["one", "two"]);
  assert.deepEqual(parseQueryList('not json', 3), []);
});

test("JSONL evaluation datasets validate, version, and persist", () => {
  const jsonl = '{"question_id":"q1","question":"What is RAG?","reference_answer":"retrieval","relevant_chunk_ids":["doc::0"]}\n';
  assert.equal(inspectJsonl(jsonl).valid, true);
  assert.equal(inspectJsonl('{"question":"missing"}\n').valid, false);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(), "rag-eval-"));
  assert.equal(saveDataset("baseline", jsonl, dir).valid, true);
  assert.equal(readDataset("baseline", dir).items.length, 1);
});

test("ranking stability measures Jaccard and Kendall tau", () => {
  assert.equal(jaccard(["a","b"],["b","c"]), 1/3);
  assert.equal(kendallTau(["a","b"],["a","b"]), 1);
  assert.equal(stability([["a","b"],["a","b"]]).jaccard.mean, 1);
});
test("experiment cost estimate is explicit and non-negative", () => assert.ok(estimateCost({inputTokens:1000}).estimatedUsd >= 0));

test("experiment metadata persists and is read back from SQLite", () => {
  db.init(); const id=randomUUID(); const experiment=metadata({chunking:{strategy:"sentence",chunkSize:700,overlap:80}});
  try { db.saveEvaluationRun({id,datasetId:"test-dataset",datasetVersion:"test-version",config:{experiment},metrics:{retrieval:{}}}); const saved=db.getEvaluationRun(id).config.experiment;
    for(const field of ["gitCommit","embeddingModel","llmModel","rerankerModel","indexHash","corpusHash","tokenUsage","estimatedCost"]) assert.ok(Object.hasOwn(saved,field));
    assert.deepEqual(saved.chunking,{strategy:"sentence",chunkSize:700,overlap:80});
  } finally { db.db.prepare("DELETE FROM evaluation_runs WHERE id=?").run(id); }
});

test("BM25 and deterministic RRF produce expected ranking", () => {
  const docs = [{ id: "a", text: "neural retrieval" }, { id: "b", text: "keyword search keyword" }];
  assert.equal(rankBm25("keyword", docs, 2)[0].id, "b");
  const fused = reciprocalRankFusion([[{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "a" }]]);
  assert.equal(fused.length, 2);
  assert.ok(fused[0].rrfScore > 0);
});

test("evaluation metrics calculate retrieval and answer scores", () => {
  const metrics = retrievalMetrics([{ question_id: "q", relevant_chunk_ids: ["a"] }], { q: ["a", "b"] }, 2);
  assert.equal(metrics.recallAtK, 1); assert.equal(metrics.mrrAtK, 1);
  assert.equal(answerMetrics("hello world", "hello world").exactMatch, 1);
  assert.deepEqual(citationMetrics(["a", "b"], ["a", "c"]), { citationValidity: 0.5, citationCoverage: 0.5 });
});

test("retrieval helpers rank by cosine score", () => {
  assert.equal(cosineSim([1, 0], [1, 0]), 1);
  assert.equal(cosineSim([1, 0], [0, 1]), 0);
  assert.deepEqual(topKScored([{ score: 0.2 }, { score: 0.9 }], 1), [{ score: 0.9 }]);
});
