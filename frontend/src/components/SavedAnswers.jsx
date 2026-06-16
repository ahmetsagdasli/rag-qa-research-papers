import React from 'react';
import {
  Card, CardContent, Stack, Typography, Box, Chip, Avatar, Accordion,
  AccordionSummary, AccordionDetails, Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts.replace(' ', 'T') + 'Z'); // SQLite UTC -> local
  return isNaN(d) ? ts : d.toLocaleString();
}

export default function SavedAnswers({ answers = [] }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 2 }}>
          <Avatar sx={{ width: 38, height: 38,
            bgcolor: (t) => alpha(t.palette.primary.main, 0.12), color: 'primary.main' }}>
            <BookmarkIcon fontSize="small" />
          </Avatar>
          <Box>
            <Typography variant="h6" lineHeight={1.2}>Saved answers</Typography>
            <Typography variant="caption" color="text.secondary">Answers you saved to this folder</Typography>
          </Box>
          <Chip label={answers.length} size="small" color="primary" sx={{ ml: 'auto', height: 22 }} />
        </Stack>

        {answers.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Avatar sx={{ width: 48, height: 48, mx: 'auto', mb: 1.5,
              bgcolor: (t) => alpha(t.palette.primary.main, 0.08), color: 'primary.light' }}>
              <BookmarkBorderIcon />
            </Avatar>
            <Typography variant="body2" color="text.secondary">
              No saved answers yet. Ask a question and click “Save to folder”.
            </Typography>
          </Box>
        ) : (
          <Stack spacing={1}>
            {answers.map((a) => (
              <Accordion key={a.id} disableGutters elevation={0}
                sx={{ '&:hover': { borderColor: 'primary.light' }, transition: 'border-color 0.16s ease' }}>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>{a.question}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDate(a.created_at)}</Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{a.answer}</Typography>
                  {Array.isArray(a.sources) && a.sources.length > 0 && (
                    <>
                      <Divider sx={{ my: 1.5 }} />
                      <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Sources:</Typography>
                        {a.sources.map((s, i) => (
                          <Chip key={i} size="small" variant="outlined"
                            label={`${s.source}#${s.chunkIndex}`} sx={{ height: 22 }} />
                        ))}
                      </Stack>
                    </>
                  )}
                </AccordionDetails>
              </Accordion>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}
