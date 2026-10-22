const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DATASET_DIR = process.env.EVALUATION_DATASET_DIR || path.join(__dirname, "..", "data", "evaluations");
const ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
function hash(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function ensureDir(dir = DATASET_DIR) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); return dir; }
function assertId(id) { if (typeof id !== "string" || !ID_PATTERN.test(id)) throw new Error("dataset id must contain only letters, numbers, underscores, or hyphens"); }
function parseJsonl(text) {
  const errors=[]; const items=[];
  text.split(/\r?\n/).forEach((line, index) => { if (!line.trim()) return; try { items.push({ ...JSON.parse(line), __line: index + 1 }); } catch { errors.push(`line ${index + 1}: invalid JSON`); } });
  return { items, parseErrors: errors };
}
function validateItems(items) {
  const errors=[]; const seen=new Set();
  for (const item of items) {
    const line=item.__line || "?";
    if (typeof item.question_id !== "string" || !item.question_id.trim()) errors.push(`line ${line}: question_id is required`);
    else if (seen.has(item.question_id)) errors.push(`line ${line}: duplicate question_id '${item.question_id}'`); else seen.add(item.question_id);
    if (typeof item.question !== "string" || !item.question.trim()) errors.push(`line ${line}: question is required`);
    if (item.reference_answer != null && typeof item.reference_answer !== "string") errors.push(`line ${line}: reference_answer must be a string`);
    for (const field of ["relevant_chunk_ids", "relevant_document_ids"]) if (item[field] != null && (!Array.isArray(item[field]) || item[field].some((id) => typeof id !== "string" && typeof id !== "number"))) errors.push(`line ${line}: ${field} must be an array of IDs`);
    if (!Array.isArray(item.relevant_chunk_ids) && !Array.isArray(item.relevant_document_ids)) errors.push(`line ${line}: relevant_chunk_ids or relevant_document_ids is required`);
  }
  return errors;
}
function inspectJsonl(text) { const { items, parseErrors }=parseJsonl(text); const errors=[...parseErrors,...validateItems(items)]; return { valid: errors.length===0, errors, itemCount: items.length, version: hash(text).slice(0, 16), contentHash: hash(text) }; }
function datasetPath(id, dir = DATASET_DIR) { assertId(id); return path.join(dir, `${id}.jsonl`); }
function saveDataset(id, jsonl, dir = DATASET_DIR) { if (typeof jsonl !== "string" || Buffer.byteLength(jsonl) > 10*1024*1024) throw new Error("jsonl must be a string no larger than 10 MB"); const report=inspectJsonl(jsonl); if(!report.valid) return report; ensureDir(dir); const target=datasetPath(id,dir); const temp=`${target}.${process.pid}.tmp`; fs.writeFileSync(temp,jsonl.endsWith("\n")?jsonl:`${jsonl}\n`); fs.renameSync(temp,target); return { ...report, id }; }
function readDataset(id, dir = DATASET_DIR) { const target=datasetPath(id,dir); if(!fs.existsSync(target)) return null; const jsonl=fs.readFileSync(target,"utf8"); const report=inspectJsonl(jsonl); return { id, ...report, items: parseJsonl(jsonl).items.map(({__line,...item})=>item) }; }
function listDatasets(dir = DATASET_DIR) { ensureDir(dir); return fs.readdirSync(dir).filter((file)=>file.endsWith(".jsonl")).map((file)=>readDataset(path.basename(file,".jsonl"),dir)).map(({items,...meta})=>meta); }
module.exports={ DATASET_DIR, parseJsonl, validateItems, inspectJsonl, saveDataset, readDataset, listDatasets };
