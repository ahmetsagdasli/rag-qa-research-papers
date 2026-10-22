import React, { useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import BuildIcon from '@mui/icons-material/Build';
import SearchIcon from '@mui/icons-material/Search';
import { rebuildGraph, searchGraph } from '../api';

export default function GraphRetrieval({ collection }) {
  const [query, setQuery] = useState(''); const [busy, setBusy] = useState(false); const [rebuilding, setRebuilding] = useState(false); const [error, setError] = useState(null); const [result, setResult] = useState(null); const [summary, setSummary] = useState(null); const [progress, setProgress] = useState(null);
  const rebuild = async () => { setRebuilding(true); setError(null); setProgress(null); try { const res=await rebuildGraph(collection.id,(percent,step)=>setProgress({percent,step})); setSummary(res); } catch (e) { setError(e.message); } finally { setRebuilding(false); setProgress(null); } };
  const search = async () => { if(!query.trim()) return; setBusy(true); setError(null); try { const res=await searchGraph(query,{collectionId:collection.id}); setResult(res.evidence || []); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <Card><CardContent><Stack spacing={2}><Stack direction="row" alignItems="center" spacing={1}><AccountTreeIcon color="secondary"/><Box><Typography variant="h6">Experimental Graph Retrieval</Typography><Typography variant="caption" color="text.secondary">Entity and relationship evidence; separate from standard RAG.</Typography></Box><Chip label="Experimental" size="small" color="secondary" variant="outlined" sx={{ml:'auto'}}/></Stack>
    {error && <Alert severity="error" onClose={()=>setError(null)}>{error}</Alert>}
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap><Button variant="outlined" startIcon={rebuilding?<CircularProgress size={15}/>:<BuildIcon/>} disabled={rebuilding} onClick={rebuild}>Rebuild graph</Button>{rebuilding&&progress && <Typography variant="caption" color="text.secondary">{progress.step} ({progress.percent||0}%)</Typography>}{!rebuilding&&summary && <Typography variant="caption" color="success.main">{summary.nodes} entities · {summary.edges} relationships · {summary.chunks} chunks</Typography>}</Stack>
    <Stack direction="row" spacing={1}><TextField size="small" fullWidth label="Search entities" value={query} onChange={(e)=>setQuery(e.target.value)} onKeyDown={(e)=>e.key==='Enter'&&search()}/><Button variant="contained" onClick={search} disabled={busy||!query.trim()} startIcon={busy?<CircularProgress size={15}/>:<SearchIcon/>}>Search</Button></Stack>
    {result && (result.length===0 ? <Alert severity="info">No graph evidence found. Rebuild the graph after documents are indexed.</Alert> : <Stack spacing={1}>{result.map((edge,index)=><Box key={`${edge.node_id}-${edge.evidence_chunk_id||index}`} sx={{p:1.25,border:'1px solid',borderColor:'divider',borderRadius:2}}><Typography variant="body2" fontWeight={600}>{edge.name} {edge.relation ? `— ${edge.relation} →` : ''} {edge.target_id || ''}</Typography><Typography variant="caption" color="text.secondary">{edge.type || 'untyped entity'} · evidence: {edge.evidence_chunk_id || 'N/A'} · weight: {edge.weight ?? 'N/A'}</Typography></Box>)}</Stack>)}
  </Stack></CardContent></Card>;
}
