function relevantSet(item) { return new Set(item.relevant_chunk_ids || []); }
function retrievalMetrics(items, rankings, k = 4) {
  let recall=0, precision=0, reciprocalRank=0, ndcg=0, count=0;
  for (const item of items) {
    const relevant=relevantSet(item); if (!relevant.size) continue;
    const ids=(rankings[item.question_id] || []).slice(0,k); const gains=ids.map((id)=>relevant.has(id)?1:0); const hits=gains.reduce((a,b)=>a+b,0);
    recall += hits/relevant.size; precision += hits/k; const first=gains.indexOf(1); reciprocalRank += first<0?0:1/(first+1);
    const dcg=gains.reduce((sum,gain,i)=>sum+(gain?1/Math.log2(i+2):0),0); const ideal=Array.from({length:Math.min(k,relevant.size)},(_,i)=>1/Math.log2(i+2)).reduce((a,b)=>a+b,0); ndcg += ideal?dcg/ideal:0; count++;
  }
  return { count, recallAtK: count?recall/count:0, precisionAtK: count?precision/count:0, mrrAtK: count?reciprocalRank/count:0, ndcgAtK: count?ndcg/count:0 };
}
function tokenize(text="") { return text.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []; }
function answerMetrics(reference, answer) { const a=tokenize(reference), b=tokenize(answer); const counts=new Map(); for(const t of a) counts.set(t,(counts.get(t)||0)+1); let match=0; for(const t of b){if((counts.get(t)||0)>0){match++;counts.set(t,counts.get(t)-1);}} const precision=b.length?match/b.length:0, recall=a.length?match/a.length:0; return { exactMatch: reference.trim()===answer.trim()?1:0, tokenF1: precision+recall?2*precision*recall/(precision+recall):0 }; }
function citationMetrics(retrievedIds = [], relevantIds = []) { const retrieved=new Set(retrievedIds); const relevant=new Set(relevantIds); const valid=[...retrieved].filter((id)=>relevant.has(id)).length; return { citationValidity: retrieved.size ? valid/retrieved.size : 0, citationCoverage: relevant.size ? valid/relevant.size : 0 }; }
function validateDataset(items) { const errors=[]; for(const [i,item] of items.entries()){if(!item.question_id||!item.question) errors.push(`line ${i+1}: question_id and question are required`); if(!Array.isArray(item.relevant_chunk_ids)&&!Array.isArray(item.relevant_document_ids)) errors.push(`line ${i+1}: relevant_chunk_ids or relevant_document_ids is required`);} return errors; }
module.exports={ retrievalMetrics, answerMetrics, citationMetrics, validateDataset };
