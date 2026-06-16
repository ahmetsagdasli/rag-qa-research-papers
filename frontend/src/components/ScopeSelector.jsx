import React, { useEffect, useState } from 'react';
import {
  Box, Stack, Typography, Checkbox, IconButton, Collapse, Chip, Button, Divider,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import FolderIcon from '@mui/icons-material/Folder';
import DescriptionIcon from '@mui/icons-material/Description';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneIcon from '@mui/icons-material/Tune';
import { listAllDocuments } from '../api';

const toggle = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

/**
 * Esnek arama kapsamı seçici.
 * value: { collectionIds:number[], documentIds:number[] }
 * Hiçbir şey seçilmezse varsayılan: o an açık olan klasör (currentCollection).
 */
export default function ScopeSelector({ collections = [], currentCollection, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState([]); // açılmış klasör id'leri
  const [docsByCol, setDocsByCol] = useState({}); // { collectionId: [doc, ...] }

  const { collectionIds, documentIds } = value;
  const nothingSelected = collectionIds.length === 0 && documentIds.length === 0;

  // Tüm belgeleri bir kez çek, klasöre göre grupla
  useEffect(() => {
    listAllDocuments()
      .then((res) => {
        const grouped = {};
        (res.documents || []).forEach((d) => {
          (grouped[d.collection_id] = grouped[d.collection_id] || []).push(d);
        });
        setDocsByCol(grouped);
      })
      .catch(console.error);
  }, [collections]);

  const setColl = (id) => onChange({ ...value, collectionIds: toggle(collectionIds, id) });
  const setDoc = (id) => onChange({ ...value, documentIds: toggle(documentIds, id) });
  const clearAll = () => onChange({ collectionIds: [], documentIds: [] });

  const docName = (id) => {
    for (const list of Object.values(docsByCol)) {
      const d = list.find((x) => x.id === id);
      if (d) return d.original_name || d.filename;
    }
    return `#${id}`;
  };
  const colName = (id) => collections.find((c) => c.id === id)?.name || `#${id}`;

  // Özet metni
  let summary;
  if (nothingSelected) {
    summary = currentCollection ? `Current folder: ${currentCollection.name}` : 'All documents';
  } else {
    const parts = [];
    if (documentIds.length) {
      parts.push(documentIds.length <= 2
        ? documentIds.map(docName).join(', ')
        : `${documentIds.length} documents`);
    }
    if (collectionIds.length) {
      parts.push(collectionIds.length <= 2
        ? collectionIds.map(colName).join(', ') + (collectionIds.length === 1 ? ' (folder)' : ' (folders)')
        : `${collectionIds.length} folders`);
    }
    summary = parts.join(' + ');
  }

  return (
    <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2,
      bgcolor: (t) => alpha(t.palette.primary.main, 0.02) }}>
      {/* Header */}
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 1.5, py: 1 }}>
        <TuneIcon fontSize="small" color="primary" />
        <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary' }}>
          SEARCH SCOPE
        </Typography>
        <Chip
          size="small"
          label={summary}
          variant="outlined"
          color={nothingSelected ? 'default' : 'primary'}
          sx={{ maxWidth: 320, '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
        />
        {!nothingSelected && (
          <Button size="small" onClick={clearAll} sx={{ minWidth: 0 }}>Reset</Button>
        )}
        <IconButton size="small" onClick={() => setOpen((o) => !o)} aria-label="Toggle scope picker"
          sx={{ ml: 'auto', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <ExpandMoreIcon fontSize="small" />
        </IconButton>
      </Stack>

      {/* Picker */}
      <Collapse in={open}>
        <Divider />
        <Box sx={{ p: 1, maxHeight: 260, overflowY: 'auto' }}>
          {collections.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>No folders.</Typography>
          )}
          {collections.map((c) => {
            const docs = docsByCol[c.id] || [];
            const folderChecked = collectionIds.includes(c.id);
            const isExpanded = expanded.includes(c.id);
            return (
              <Box key={c.id}>
                <Stack direction="row" alignItems="center" sx={{ borderRadius: 1.5,
                  '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.04) } }}>
                  <Checkbox size="small" checked={folderChecked} onChange={() => setColl(c.id)}
                    inputProps={{ 'aria-label': `Select folder ${c.name}` }} />
                  <FolderIcon fontSize="small" color="primary" sx={{ mr: 0.5 }} />
                  <Typography variant="body2" fontWeight={600} sx={{ flexGrow: 1 }}>{c.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
                    {docs.length} docs
                  </Typography>
                  {docs.length > 0 && (
                    <IconButton size="small" onClick={() => setExpanded((e) => toggle(e, c.id))}
                      aria-label={`Expand ${c.name}`}
                      sx={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <ExpandMoreIcon fontSize="small" />
                    </IconButton>
                  )}
                </Stack>
                <Collapse in={isExpanded}>
                  <Stack sx={{ pl: 4 }}>
                    {docs.map((d) => {
                      const checked = folderChecked || documentIds.includes(d.id);
                      return (
                        <Stack key={d.id} direction="row" alignItems="center"
                          sx={{ borderRadius: 1.5, '&:hover': { bgcolor: (t) => alpha(t.palette.primary.main, 0.04) } }}>
                          <Checkbox size="small" checked={checked} disabled={folderChecked}
                            onChange={() => setDoc(d.id)}
                            inputProps={{ 'aria-label': `Select document ${d.original_name || d.filename}` }} />
                          <DescriptionIcon fontSize="small" sx={{ color: 'text.secondary', mr: 0.5 }} />
                          <Typography variant="body2" noWrap>{d.original_name || d.filename}</Typography>
                        </Stack>
                      );
                    })}
                  </Stack>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Box>
  );
}
