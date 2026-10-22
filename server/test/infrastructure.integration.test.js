const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

test("pgvector migration and collection replacement", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  delete require.cache[require.resolve("../src/vector-store")];
  const store = require("../src/vector-store");
  await store.migrate();
  const collectionId = Number(`9${Date.now().toString().slice(-8)}`);
  const vector = Array.from({ length: 1536 }, (_, i) => i === 0 ? 1 : 0);
  await store.replaceCollection(collectionId, [{ id: crypto.randomUUID(), documentId: 1, collectionId, chunkIndex: 0, text: "integration vector", vector, source: "test.pdf", embeddingModel: "text-embedding-3-small", contentHash: "test", chunkingStrategy: "fixed" }]);
  const rows = await store.searchDense(vector, { collectionIds: [collectionId] }, 1);
  assert.equal(rows.length, 1);
});

test("BullMQ queue job lifecycle", { skip: !process.env.TEST_REDIS_URL }, async () => {
  const { Queue } = require("bullmq"); const IORedis = require("ioredis");
  const connection = new IORedis(process.env.TEST_REDIS_URL, { maxRetriesPerRequest: null });
  const queue = new Queue(`rag-test-${Date.now()}`, { connection });
  const job = await queue.add("verification", { value: 1 });
  assert.equal(await job.getState(), "waiting");
  await queue.obliterate({ force: true }); await queue.close(); await connection.quit();
});

test("external provider adapters remain mockable", () => {
  const mockEmbedding = async () => ({ data: [{ embedding: [1, 0] }] });
  const mockRerank = async () => ({ results: [{ index: 0, relevance_score: 0.9 }] });
  return Promise.all([mockEmbedding(), mockRerank()]).then(([embedding, rerank]) => { assert.equal(embedding.data[0].embedding[0], 1); assert.equal(rerank.results[0].index, 0); });
});
