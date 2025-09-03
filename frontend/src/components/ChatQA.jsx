import React, { useState } from 'react';
import { Card, CardContent, Stack, TextField, Button, Typography, LinearProgress } from '@mui/material';
import SourceCard from './SourceCard';
import { ask } from '../api';


export default function ChatQA() {
const [q, setQ] = useState('Why are transformers good at modeling long dependencies?');
const [busy, setBusy] = useState(false);
const [answer, setAnswer] = useState('');
const [sources, setSources] = useState([]);


const onAsk = async () => {
if (!q.trim()) return;
setBusy(true);
setAnswer('');
setSources([]);
try {
const res = await ask(q, 4);
setAnswer(res.answer);
setSources(res.sources || []);
} catch (e) {
setAnswer('An error occurred.');
} finally { setBusy(false); }
};


return (
<Card>
{busy && <LinearProgress />}
<CardContent>
<Stack spacing={2}>
<Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
<TextField fullWidth label="Your Question" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && onAsk()} />
<Button variant="contained" onClick={onAsk}>Ask</Button>
</Stack>


{answer && (
<>
<Typography variant="h6">Answer</Typography>
<Typography sx={{ whiteSpace: 'pre-wrap' }}>{answer}</Typography>
<Typography variant="subtitle1" sx={{ mt: 2 }}>Sources</Typography>
{sources.map(s => <SourceCard key={s.id} source={s} />)}
</>
)}
</Stack>
</CardContent>
</Card>
);
}