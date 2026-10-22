const store = require("./vector-store");
async function retrieveGraphEvidence(query, { collectionId = null, limit = 20 } = {}) {
  if (!store.enabled()) throw new Error("Experimental Graph Retrieval requires DATABASE_URL");
  const params=[`%${query.toLocaleLowerCase()}%`]; let where="lower(n.name) LIKE $1";
  if(collectionId != null){params.push(collectionId);where+=` AND n.collection_id = $${params.length}`;} params.push(Math.min(100,Math.max(1,limit)));
  const rows=await store.getPool().query(`SELECT n.id AS node_id,n.name,n.type,e.relation,e.target_id,target.name AS target_name,e.evidence_chunk_id,e.weight FROM graph_nodes n LEFT JOIN graph_edges e ON e.source_id=n.id LEFT JOIN graph_nodes target ON target.id=e.target_id WHERE ${where} ORDER BY e.weight DESC NULLS LAST LIMIT $${params.length}`,params);
  return rows.rows;
}
module.exports={ retrieveGraphEvidence };
