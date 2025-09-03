import React from 'react';
import { Card, CardContent, Typography } from '@mui/material';


export default function SourceCard({ source }) {
return (
<Card variant="outlined" sx={{ mb: 1 }}>
<CardContent>
<Typography variant="subtitle2" gutterBottom>
Source: {source.source || 'Unknown'} — #{source.chunkIndex || 0}
</Typography>
<Typography variant="caption" color="text.secondary">
Score: {source.score ? source.score.toFixed(3) : 'N/A'} | Preview: {source.preview?.length || 0} chars
</Typography>
<Typography variant="body2" sx={{ mt: 1, whiteSpace: 'pre-wrap' }}>
{source.preview || source.text || 'No preview available'}
</Typography>
</CardContent>
</Card>
);
}