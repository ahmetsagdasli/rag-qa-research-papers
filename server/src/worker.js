require("dotenv").config();
require("./db").init();
const { startWorker, startEvaluationWorker, startGraphRebuildWorker } = require("./jobs");
const vectorStore = require("./vector-store");
(async () => {
  if (vectorStore.enabled()) await vectorStore.migrate();
  const worker = startWorker();
  const evaluationWorker = startEvaluationWorker();
  const graphWorker = startGraphRebuildWorker();
  worker.on("completed", (job) => console.info(`index job ${job.id} completed`));
  worker.on("failed", (job, error) => console.error(`index job ${job?.id} failed:`, error.message));
  evaluationWorker.on("completed", (job) => console.info(`evaluation job ${job.id} completed`));
  evaluationWorker.on("failed", (job, error) => console.error(`evaluation job ${job?.id} failed:`, error.message));
  graphWorker.on("completed", (job) => console.info(`graph rebuild job ${job.id} completed`));
  graphWorker.on("failed", (job, error) => console.error(`graph rebuild job ${job?.id} failed:`, error.message));
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, async () => { await Promise.all([worker.close(), evaluationWorker.close(), graphWorker.close()]); process.exit(0); });
})().catch((error) => { console.error("worker startup failed:", error); process.exit(1); });
