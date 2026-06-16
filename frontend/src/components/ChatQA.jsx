import React, { useState, useEffect } from 'react';
import {
  Card, CardContent, Stack, TextField, Button, Typography, LinearProgress,
  Box, Chip, Avatar, Divider, InputAdornment, Skeleton,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import SendIcon from '@mui/icons-material/Send';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import BookmarkAddedIcon from '@mui/icons-material/BookmarkAdded';
import SourceCard from './SourceCard';
import ScopeSelector from './ScopeSelector';
import { tokens } from '../theme';
import { ask, saveAnswer } from '../api';

const EXAMPLES = [
  'What problem does this paper address?',
  'Summarize the key findings.',
  'What methods were used?',
];

export default function ChatQA({ collection, collections = [], hasDocuments = false, onSaved }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [asked, setAsked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [scope, setScope] = useState({ collectionIds: [], documentIds: [] });

  // Klasör değişince scope'u sıfırla (varsayılan: açık olan klasör)
  useEffect(() => {
    setScope({ collectionIds: [], documentIds: [] });
  }, [collection?.id]);

  const onAsk = async () => {
    if (!q.trim() || busy) return;
    setBusy(true); setAnswer(''); setSources([]); setAsked(true); setSaved(false);
    try {
      // Bir şey seçiliyse scope gönder; değilse null -> backend açık klasörü kullanır
      const hasSelection = scope.collectionIds.length > 0 || scope.documentIds.length > 0;
      const res = await ask(q, {
        collectionId: collection?.id ?? null,
        scope: hasSelection ? scope : null,
        topK: 4,
      });
      setAnswer(res.answer);
      setSources(res.sources || []);
    } catch (e) {
      setAnswer('An error occurred while answering. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onSave = async () => {
    if (!answer || saving) return;
    setSaving(true);
    try {
      await saveAnswer({ collectionId: collection?.id ?? null, question: q, answer, sources });
      setSaved(true);
      onSaved?.();
    } catch (e) {
      console.error('Save failed:', e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      {busy && <LinearProgress />}
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Stack spacing={2.5}>
          {/* Header */}
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Avatar sx={{ width: 38, height: 38, background: tokens.gradient, boxShadow: tokens.shadow.accent }}>
              <AutoAwesomeIcon fontSize="small" />
            </Avatar>
            <Box>
              <Typography variant="h6" lineHeight={1.2}>Ask a question</Typography>
              <Typography variant="caption" color="text.secondary">
                {hasDocuments
                  ? `Answers are scoped to “${collection?.name}”`
                  : 'Add documents to this folder first for best results'}
              </Typography>
            </Box>
          </Stack>

          {/* Search scope */}
          <ScopeSelector
            collections={collections}
            currentCollection={collection}
            value={scope}
            onChange={setScope}
          />

          {/* Input */}
          <TextField
            fullWidth multiline maxRows={4}
            placeholder="e.g. Why are transformers good at modeling long dependencies?"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onAsk(); } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>
                  <HelpOutlineIcon color="action" fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          {/* Examples + Ask */}
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
            <Typography variant="caption" color="text.secondary">Try:</Typography>
            {EXAMPLES.map((ex) => (
              <Chip key={ex} label={ex} size="small" variant="outlined"
                onClick={() => setQ(ex)}
                sx={{ cursor: 'pointer', transition: 'all 0.16s ease',
                  '&:hover': { borderColor: 'primary.main', color: 'primary.main',
                    bgcolor: (t) => alpha(t.palette.primary.main, 0.06) } }} />
            ))}
            <Button variant="contained" endIcon={<SendIcon />} onClick={onAsk}
              disabled={busy || !q.trim()} sx={{ ml: 'auto' }}>Ask</Button>
          </Stack>

          {/* Conversation */}
          {asked && (
            <>
              <Divider />

              {/* User question */}
              <Stack direction="row" spacing={1.5} justifyContent="flex-end" alignItems="flex-start">
                <Box sx={{ maxWidth: '85%', px: 2, py: 1.25, borderRadius: '14px 14px 4px 14px',
                  bgcolor: (t) => alpha(t.palette.primary.main, 0.10), border: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{q}</Typography>
                </Box>
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'grey.200', color: 'text.secondary' }}>
                  <PersonOutlineIcon fontSize="small" />
                </Avatar>
              </Stack>

              {/* AI answer */}
              <Stack direction="row" spacing={1.5} alignItems="flex-start">
                <Avatar sx={{ width: 32, height: 32, background: tokens.gradient }}>
                  <AutoAwesomeIcon sx={{ fontSize: 18 }} />
                </Avatar>
                <Box sx={{ flexGrow: 1, minWidth: 0, p: 2, borderRadius: '14px 14px 14px 4px',
                  background: tokens.gradientSoft, border: '1px solid', borderColor: 'divider' }}>
                  <Stack direction="row" alignItems="center" sx={{ mb: 1 }}>
                    <Typography variant="subtitle2" color="primary.dark">AI Answer</Typography>
                    {!busy && answer && (
                      <Button size="small" sx={{ ml: 'auto', minWidth: 0 }}
                        startIcon={saved ? <BookmarkAddedIcon /> : <BookmarkAddIcon />}
                        onClick={onSave} disabled={saving || saved} color={saved ? 'success' : 'primary'}>
                        {saved ? 'Saved' : saving ? 'Saving…' : 'Save to folder'}
                      </Button>
                    )}
                  </Stack>
                  {busy ? (
                    <Box>
                      <Skeleton variant="text" width="92%" />
                      <Skeleton variant="text" width="100%" />
                      <Skeleton variant="text" width="78%" />
                    </Box>
                  ) : (
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: 'text.primary' }}>
                      {answer}
                    </Typography>
                  )}
                </Box>
              </Stack>

              {/* Sources */}
              {sources.length > 0 && (
                <Box sx={{ pl: { sm: 6 } }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.5 }}>
                    <Typography variant="subtitle2">Sources</Typography>
                    <Chip label={sources.length} size="small" color="primary" sx={{ height: 20 }} />
                  </Stack>
                  <Stack spacing={1.5}>
                    {sources.map((s, i) => <SourceCard key={s.id} source={s} rank={i + 1} />)}
                  </Stack>
                </Box>
              )}
            </>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
