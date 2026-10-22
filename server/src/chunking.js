const crypto = require("crypto");
const DEFAULTS = { strategy: "fixed", chunkSize: 800, overlap: 100, minChunkLength: 100 };

function normalizeConfig(input = {}) {
  const strategy = ["fixed", "recursive", "sentence"].includes(input.strategy) ? input.strategy : DEFAULTS.strategy;
  const chunkSize = Math.max(100, Math.min(4000, Number(input.chunkSize) || DEFAULTS.chunkSize));
  const overlap = Math.max(0, Math.min(chunkSize - 1, Number(input.overlap) || DEFAULTS.overlap));
  const minChunkLength = Math.max(1, Math.min(chunkSize, Number(input.minChunkLength) || DEFAULTS.minChunkLength));
  return { strategy, chunkSize, overlap, minChunkLength };
}
function fixed(text, cfg) { const out=[]; for(let i=0;i<text.length;) { const end=Math.min(i+cfg.chunkSize,text.length); out.push(text.slice(i,end)); if(end===text.length) break; i=end-cfg.overlap; } return out; }
function sentence(text, cfg) { const sentences=text.match(/[^.!?\n]+[.!?]?|\S+/g) || []; const out=[]; let current=""; for(const part of sentences) { const next=(current?`${current} `:"")+part.trim(); if(next.length>cfg.chunkSize && current){out.push(current); current=part.trim();} else current=next;} if(current) out.push(current); return out; }
function recursive(text, cfg) { let units=[text]; for(const separator of ["\n\n","\n",". "," "]) { units=units.flatMap((unit)=>unit.length<=cfg.chunkSize?[unit]:unit.split(separator).filter(Boolean)); } const out=[]; let current=""; for(const unit of units){const next=(current?`${current} `:"")+unit.trim(); if(next.length>cfg.chunkSize&&current){out.push(current);current=unit.trim();}else current=next;} if(current) out.push(current); return out; }
function sectionHeading(text) { const line=(text.split("\n").find((x)=>x.trim()) || "").trim(); return line.length>0 && line.length<120 && (/^\d+(\.\d+)*\s+/.test(line) || /^[A-Z][A-Z\s]{4,}$/.test(line)) ? line : null; }
function chunkDocument(text, input) { const cfg=normalizeConfig(input); const raw=cfg.strategy==="sentence"?sentence(text,cfg):cfg.strategy==="recursive"?recursive(text,cfg):fixed(text,cfg); return raw.filter((x)=>x.trim().length>=cfg.minChunkLength).map((value)=>({ text:value.trim(), sectionHeading:sectionHeading(value), contentHash:crypto.createHash("sha256").update(value.trim()).digest("hex") })); }
module.exports = { DEFAULTS, normalizeConfig, chunkDocument };
