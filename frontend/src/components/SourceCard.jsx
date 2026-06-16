import React, { useState } from 'react';
import { Box, Card, Stack, Typography, Chip, Collapse, IconButton, Tooltip } from '@mui/material';
import { alpha } from '@mui/material/styles';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';

function scoreColor(score) {
  if (score >= 0.7) return 'success';
  if (score >= 0.5) return 'primary';
  return 'default';
}

export default function SourceCard({ source, rank }) {
  const [open, setOpen] = useState(false);
  const score = typeof source.score === 'number' ? source.score : null;
  // Reranking açıkken cross-encoder relevance (0-1), değilse ham cosine benzerliği
  const kind = source.scoreType === 'rerank' ? 'cross-encoder relevance' : 'cosine similarity';
  const pct = score === null ? null : score * 100;
  const pctText = pct === null ? '—' : pct >= 1 ? `${Math.round(pct)}%` : pct > 0 ? '<1%' : '~0%';
  // Sıra numarası her zaman anlamlı; mutlak skor geniş sorularda düşük olabilir.
  const tip = score === null
    ? 'Retrieved passage'
    : `Rank #${rank} of retrieved passages · ${kind}: ${score.toFixed(4)}. ` +
      'Absolute scores are naturally low for broad/summary questions — the ranking order is what matters.';

  return (
    <Card variant="outlined" sx={{ overflow: 'hidden', borderRadius: 3,
      transition: 'border-color 0.16s ease, box-shadow 0.16s ease',
      '&:hover': { borderColor: 'primary.light', boxShadow: 1 } }}>
      <Stack
        direction="row" alignItems="center" spacing={1.5}
        onClick={() => setOpen((o) => !o)}
        role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        sx={{ p: 1.5, cursor: 'pointer',
          '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.03) } }}
      >
        <Box sx={{ width: 34, height: 34, borderRadius: 2, flexShrink: 0,
          display: 'grid', placeItems: 'center',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.12), color: 'primary.main' }}>
          <PictureAsPdfIcon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0, flexGrow: 1 }}>
          <Typography variant="body2" fontWeight={600} noWrap>{source.source || 'Unknown'}</Typography>
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ flexWrap: 'wrap' }}>
            {source.collectionName && (
              <Stack direction="row" spacing={0.25} alignItems="center">
                <FolderIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" noWrap>{source.collectionName}</Typography>
              </Stack>
            )}
            <Typography variant="caption" color="text.secondary">· Chunk #{source.chunkIndex ?? 0}</Typography>
          </Stack>
        </Box>
        {source.scoreType === 'head' ? (
          <Tooltip title="Document title page (title, authors, abstract) — always included for context" arrow>
            <Chip label="title page" size="small" color="secondary" variant="outlined" />
          </Tooltip>
        ) : score !== null && (
          <Tooltip title={tip} arrow>
            <Chip label={`#${rank} · ${pctText}`} size="small"
              color={scoreColor(score)} variant={scoreColor(score) === 'default' ? 'outlined' : 'filled'} />
          </Tooltip>
        )}
        <Tooltip title={open ? 'Hide excerpt' : 'Show excerpt'} arrow>
          <IconButton size="small" aria-label={open ? 'Hide excerpt' : 'Show excerpt'}
            sx={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s ease' }}>
            <ExpandMoreIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      <Collapse in={open}>
        <Box sx={{ mx: 1.5, mb: 1.5, p: 1.5, borderRadius: 2,
          borderLeft: '3px solid', borderColor: 'primary.main',
          bgcolor: (t) => alpha(t.palette.primary.main, 0.04) }}>
          <Typography variant="body2"
            sx={{ whiteSpace: 'pre-wrap', color: 'text.secondary', fontSize: 13, lineHeight: 1.6 }}>
            {source.preview || source.text || 'No preview available'}
          </Typography>
        </Box>
      </Collapse>
    </Card>
  );
}
