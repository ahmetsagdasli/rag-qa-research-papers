const { randomUUID } = require("crypto");
const { Queue, Worker } = require("bullmq");
const redis = require("./redis");
const { ingestCollection } = require("./ingest");
const { runEvaluation } = require("./evaluation-runner");
const { rebuildGraph } = require("./graph-extraction");

const INDEX_QUEUE_NAME = "rag-indexing";
const EVALUATION_QUEUE_NAME = "rag-evaluation";
const GRAPH_QUEUE_NAME = "rag-graph-rebuild";
const memoryJobs = new Map();
const memoryActiveIndexJobs = new Map();
const memoryActiveGraphJobs = new Map();
const queues = new Map();

function redisEnabled() { return redis.enabled(); }
function getConnection() { return redis.getConnection(); }
function getQueue(name) {
  if (!redisEnabled()) return null;
  if (!queues.has(name)) queues.set(name, new Queue(name, { connection: getConnection() }));
  return queues.get(name);
}

async function processIndex(job) {
  const { collectionId, chunking } = job.data;
  await job.updateProgress({ percent: 1, step: "Processing PDF files" });
  const result = await ingestCollection(collectionId, async (step, percent) => {
    await job.updateProgress({ percent, step });
  }, { chunking });
  await job.updateProgress({ percent: 100, step: "Ready for questions." });
  return result;
}

async function processEvaluation(job) {
  return runEvaluation(job.data, async (step, percent) => {
    await job.updateProgress({ percent, step });
  });
}

async function processGraphRebuild(job) {
  const { collectionId } = job.data;
  return rebuildGraph(collectionId, async (step, percent) => {
    await job.updateProgress({ percent, step });
  });
}

function startWorker() {
  if (!redisEnabled()) throw new Error("REDIS_URL is required to start the BullMQ worker");
  return new Worker(INDEX_QUEUE_NAME, processIndex, { connection: getConnection(), concurrency: Number(process.env.INDEX_WORKER_CONCURRENCY || 2) });
}

function startEvaluationWorker() {
  if (!redisEnabled()) throw new Error("REDIS_URL is required to start the BullMQ worker");
  return new Worker(EVALUATION_QUEUE_NAME, processEvaluation, { connection: getConnection(), concurrency: Number(process.env.EVAL_WORKER_CONCURRENCY || 2) });
}

function startGraphRebuildWorker() {
  if (!redisEnabled()) throw new Error("REDIS_URL is required to start the BullMQ worker");
  return new Worker(GRAPH_QUEUE_NAME, processGraphRebuild, { connection: getConnection(), concurrency: Number(process.env.GRAPH_WORKER_CONCURRENCY || 1) });
}

async function startMemoryJob(collectionId, options) {
  const activeId = memoryActiveIndexJobs.get(collectionId); const active = activeId && memoryJobs.get(activeId);
  if (active && ["queued", "processing"].includes(active.status)) return active;
  const job = { id: randomUUID(), collectionId, status: "queued", progress: 0, step: "Queued", error: null, chunking: options.chunking };
  memoryJobs.set(job.id, job); memoryActiveIndexJobs.set(collectionId, job.id);
  if (process.env.VERCEL) {
    job.status = "processing";
    try { job.result = await ingestCollection(collectionId, (step, progress) => Object.assign(job, { step, progress }), options); Object.assign(job, { status: "completed", progress: 100, step: "Ready for questions." }); }
    catch (error) { Object.assign(job, { status: "failed", error }); }
    finally { memoryActiveIndexJobs.delete(collectionId); }
    return job;
  }
  setImmediate(async () => { job.status = "processing"; try { job.result = await ingestCollection(collectionId, (step, progress) => Object.assign(job, { step, progress }), options); Object.assign(job, { status: "completed", progress: 100, step: "Ready for questions." }); } catch (error) { Object.assign(job, { status: "failed", error }); } finally { memoryActiveIndexJobs.delete(collectionId); } });
  return job;
}

async function startMemoryEvaluationJob(payload) {
  const job = { id: randomUUID(), status: "queued", progress: 0, step: "Queued", error: null };
  memoryJobs.set(job.id, job);
  setImmediate(async () => {
    job.status = "processing";
    try {
      job.result = await runEvaluation(payload, (step, progress) => Object.assign(job, { step, progress }));
      Object.assign(job, { status: "completed", progress: 100, step: "Done" });
    } catch (error) {
      Object.assign(job, { status: "failed", error });
    }
  });
  return job;
}

async function startMemoryGraphRebuildJob(collectionId) {
  const activeId = memoryActiveGraphJobs.get(collectionId); const active = activeId && memoryJobs.get(activeId);
  if (active && ["queued", "processing"].includes(active.status)) return active;
  const job = { id: randomUUID(), collectionId, status: "queued", progress: 0, step: "Queued", error: null };
  memoryJobs.set(job.id, job); memoryActiveGraphJobs.set(collectionId, job.id);
  setImmediate(async () => {
    job.status = "processing";
    try {
      job.result = await rebuildGraph(collectionId, (step, progress) => Object.assign(job, { step, progress }));
      Object.assign(job, { status: "completed", progress: 100, step: "Done" });
    } catch (error) {
      Object.assign(job, { status: "failed", error });
    } finally {
      memoryActiveGraphJobs.delete(collectionId);
    }
  });
  return job;
}

async function startIndexJob(collectionId, options = {}) {
  if (!redisEnabled()) return startMemoryJob(collectionId, options);
  const existing = await getQueue(INDEX_QUEUE_NAME).getJobs(["waiting", "active", "delayed"]);
  const duplicate = existing.find((job) => job.data.collectionId === collectionId);
  if (duplicate) return { id: duplicate.id, collectionId, status: "queued", progress: 0, step: "Already queued", chunking: duplicate.data.chunking };
  const id = randomUUID();
  await getQueue(INDEX_QUEUE_NAME).add("index", { collectionId, chunking: options.chunking }, { jobId: id, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: 100, removeOnFail: 100 });
  return { id, collectionId, status: "queued", progress: 0, step: "Queued", chunking: options.chunking };
}

async function startEvaluationJob(payload) {
  if (!redisEnabled()) return startMemoryEvaluationJob(payload);
  const id = randomUUID();
  await getQueue(EVALUATION_QUEUE_NAME).add("evaluate", payload, { jobId: id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  return { id, status: "queued", progress: 0, step: "Queued" };
}

async function startGraphRebuildJob(collectionId) {
  if (!redisEnabled()) return startMemoryGraphRebuildJob(collectionId);
  const existing = await getQueue(GRAPH_QUEUE_NAME).getJobs(["waiting", "active", "delayed"]);
  const duplicate = existing.find((job) => job.data.collectionId === collectionId);
  if (duplicate) return { id: duplicate.id, collectionId, status: "queued", progress: 0, step: "Already queued" };
  const id = randomUUID();
  await getQueue(GRAPH_QUEUE_NAME).add("rebuild", { collectionId }, { jobId: id, attempts: 1, removeOnComplete: 100, removeOnFail: 100 });
  return { id, collectionId, status: "queued", progress: 0, step: "Queued" };
}

function mapState(state) { return ({ waiting: "queued", delayed: "queued", active: "processing", completed: "completed", failed: "failed" })[state] || state; }

async function getJob(id) {
  if (!redisEnabled()) return memoryJobs.get(id);
  const job = await getQueue(INDEX_QUEUE_NAME).getJob(id); if (!job) return null;
  const state = await job.getState(); const progress = typeof job.progress === "object" ? job.progress : {};
  return { id: job.id, collectionId: job.data.collectionId, status: mapState(state), progress: progress.percent || (state === "completed" ? 100 : 0), step: progress.step || state, result: job.returnvalue, error: job.failedReason ? new Error(job.failedReason) : null, chunking: job.data.chunking };
}

async function getEvaluationJob(id) {
  if (!redisEnabled()) return memoryJobs.get(id);
  const job = await getQueue(EVALUATION_QUEUE_NAME).getJob(id); if (!job) return null;
  const state = await job.getState(); const progress = typeof job.progress === "object" ? job.progress : {};
  return { id: job.id, status: mapState(state), progress: progress.percent || (state === "completed" ? 100 : 0), step: progress.step || state, result: job.returnvalue, error: job.failedReason ? new Error(job.failedReason) : null };
}

async function getGraphRebuildJob(id) {
  if (!redisEnabled()) return memoryJobs.get(id);
  const job = await getQueue(GRAPH_QUEUE_NAME).getJob(id); if (!job) return null;
  const state = await job.getState(); const progress = typeof job.progress === "object" ? job.progress : {};
  return { id: job.id, collectionId: job.data.collectionId, status: mapState(state), progress: progress.percent || (state === "completed" ? 100 : 0), step: progress.step || state, result: job.returnvalue, error: job.failedReason ? new Error(job.failedReason) : null };
}

function publicJob(job, errorMapper) { if (!job) return null; return { id: job.id, collectionId: job.collectionId, status: job.status, progress: job.progress, step: job.step, chunking: job.chunking, result: job.result, error: job.status === "failed" ? errorMapper(job.error).message : null }; }

module.exports = { startIndexJob, getJob, startEvaluationJob, getEvaluationJob, startGraphRebuildJob, getGraphRebuildJob, publicJob, startWorker, startEvaluationWorker, startGraphRebuildWorker, redisEnabled, INDEX_QUEUE_NAME, EVALUATION_QUEUE_NAME, GRAPH_QUEUE_NAME };
