import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BuildIcon from '@mui/icons-material/Build';
import SearchIcon from '@mui/icons-material/Search';
import { rebuildGraph, searchGraph } from '../api';

function RelationDiagram({ edges }) {
  const nodes = [...new Map(edges.flatMap((edge) => [[edge.node_id, edge.name], [edge.target_id, edge.target_name || edge.target_id]]).filter(([id]) => id)).entries()];
  const width = 720, height = Math.max(220, 120 + nodes.length * 76);
  const positions = new Map(nodes.map(([id], index) => [id, { x: index % 2 ? 530 : 190, y: 72 + Math.floor(index / 2) * 120 }]));
  return <Box sx={{ overflowX: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: 'rgba(124,77,255,0.025)' }}>
    <svg width={width} height={height} role="img" aria-label="Entity relationship diagram">
      <defs><marker id="arrow" markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto"><path d="M0,0 L9,4.5 L0,9Z" fill="#7c4dff" /></marker></defs>
      {edges.filter((edge) => edge.target_id).map((edge, index) => { const from=positions.get(edge.node_id),to=positions.get(edge.target_id); if(!from||!to)return null; const midX=(from.x+to.x)/2,midY=(from.y+to.y)/2-10; return <g key={`${edge.node_id}-${edge.target_id}-${index}`}><line x1={from.x+(from.x<to.x?86:-86)} y1={from.y} x2={to.x+(from.x<to.x?-86:86)} y2={to.y} stroke="#7c4dff" strokeWidth="2" markerEnd="url(#arrow)"/><rect x={midX-54} y={midY-13} width="108" height="25" rx="12" fill="#fff" stroke="#ddd"/><text x={midX} y={midY+4} textAnchor="middle" fontSize="11" fill="#5d3fd3">{edge.relation || 'related to'}</text></g>; })}
      {nodes.map(([id,name]) => { const p=positions.get(id); const label=String(name || 'Unknown'); return <g key={id}><rect x={p.x-88} y={p.y-25} width="176" height="50" rx="14" fill="#fff" stroke="#7c4dff" strokeWidth="1.5"/><text x={p.x} y={p.y+5} textAnchor="middle" fontSize="13" fontWeight="600" fill="#251b45">{label.length>21?`${label.slice(0,20)}…`:label}</text></g>; })}
    </svg>
  </Box>;
}

export default function GraphRetrieval({ collection }) {
  const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false); const [rebuilding, setRebuilding] = useState(false); const [error, setError] = useState(null); const [result, setResult] = useState(null); const [summary, setSummary] = useState(null); const [progress, setProgress] = useState(null);
  const rebuild = async () => { setRebuilding(true); setError(null); setProgress(null); try { const res=await rebuildGraph(collection.id,(percent,step)=>setProgress({percent,step})); setSummary(res); const overview=await searchGraph('',{collectionId:collection.id,limit:40}); setResult(overview.evidence || []); } catch (e) { setError(e.message); } finally { setRebuilding(false); setProgress(null); } };
  const search = async () => { if(!query.trim()) return; setBusy(true); setError(null); try { const res=await searchGraph(query,{collectionId:collection.id}); setResult(res.evidence || []); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Card><CardContent><Stack spacing={2}><Stack direction="row" alignItems="center" spacing={1}><AccountTreeIcon color="secondary"/><Box><Typography variant="h6">Experimental Graph Retrieval</Typography><Typography variant="caption" color="text.secondary">Entity and relationship evidence; separate from standard RAG.</Typography></Box><Chip label="Experimental" size="small" color="secondary" variant="outlined" sx={{ml:'auto'}}/></Stack>
    {error && <Alert severity="error" onClose={()=>setError(null)}>{error}</Alert>}
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Button variant="outlined" startIcon={rebuilding?<CircularProgress size={15}/>:<BuildIcon/>} disabled={rebuilding} onClick={rebuild}>Rebuild graph</Button>{rebuilding&&progress && <Typography variant="caption" color="text.secondary">{progress.step} ({progress.percent||0}%)</Typography>}{!rebuilding&&summary && <Typography variant="caption" color="success.main">{summary.nodes} entities · {summary.edges} relationships · {summary.chunks} chunks</Typography>}</Stack>
    <Stack direction="row" spacing={1}><TextField size="small" fullWidth label="Filter graph entities (e.g. Transformer)" value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&search()}/><Button variant="contained" onClick={search} disabled={busy||!query.trim()} startIcon={busy?<CircularProgress size={15}/>:<SearchIcon/>}>Filter</Button></Stack>
    {result && (result.length===0 ? <Alert severity="info">No graph evidence found. Rebuild the graph after documents are indexed.</Alert> : <Stack spacing={1.5}><RelationDiagram edges={result}/><Stack spacing={1}>{result.map((edge,index)=><Box key={`${edge.node_id}-${edge.evidence_chunk_id||index}`} sx={{p:1.25,border:'1px solid',borderColor:'divider',borderRadius:2}}><Typography variant="body2" fontWeight={600}>{edge.name} {edge.relation ? `— ${edge.relation} →` : ''} {edge.target_name || edge.target_id || ''}</Typography><Typography variant="caption" color="text.secondary">{edge.type || 'untyped entity'} · evidence: {edge.evidence_chunk_id || 'N/A'} · weight: {edge.weight ?? 'N/A'}</Typography></Box>)}</Stack></Stack>)}
  </Stack></CardContent></Card>;
}
