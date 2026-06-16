import { createTheme } from '@mui/material/styles';

/*
 * TASARIM SİSTEMİ — tek kaynak.
 * Renkler: slate/gri nötr palet + mor vurgu (indigo → violet).
 * Spacing 8px tabanlı, tutarlı radius ve yumuşak gölge seviyeleri.
 * `tokens` export'u gradient ve özel gölgeleri sx içinde kullanmak içindir.
 */

// Vurgu (mor) ve nötr (slate) renk skalaları — token kaynağı
const accent = {
  50: '#eef2ff', 100: '#e0e7ff', 200: '#c7d2fe', 300: '#a5b4fc',
  400: '#818cf8', 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca',
};
const violet = { 400: '#c084fc', 500: '#a855f7', 600: '#9333ea' };
const slate = {
  50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1',
  400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155',
  800: '#1e293b', 900: '#0f172a',
};

export const tokens = {
  accent,
  violet,
  slate,
  radius: { sm: 10, md: 14, lg: 20, pill: 999 },
  gradient: `linear-gradient(135deg, ${accent[500]} 0%, ${violet[500]} 100%)`,
  gradientHover: `linear-gradient(135deg, ${accent[600]} 0%, ${violet[600]} 100%)`,
  gradientText: `linear-gradient(135deg, ${accent[600]} 0%, ${violet[500]} 100%)`,
  gradientSoft: `linear-gradient(135deg, ${accent[50]} 0%, #faf5ff 100%)`,
  shadow: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.04)',
    sm: '0 2px 8px rgba(15, 23, 42, 0.06)',
    md: '0 8px 24px rgba(15, 23, 42, 0.08)',
    lg: '0 16px 40px rgba(15, 23, 42, 0.10)',
    accent: `0 10px 24px ${accent[500]}59`, // ~35% alpha
  },
};

// Yumuşak gölge skalasını MUI elevation'larına bağla
const base = createTheme();
const shadows = [...base.shadows];
shadows[1] = tokens.shadow.xs;
shadows[2] = tokens.shadow.sm;
shadows[3] = tokens.shadow.md;
shadows[4] = tokens.shadow.lg;

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: accent[500], light: accent[400], dark: accent[600], contrastText: '#fff' },
    secondary: { main: violet[500], dark: violet[600], contrastText: '#fff' },
    success: { main: '#10b981' },
    warning: { main: '#f59e0b' },
    error: { main: '#ef4444' },
    grey: slate,
    background: { default: slate[50], paper: '#ffffff' },
    text: { primary: slate[900], secondary: slate[500] },
    divider: 'rgba(100, 116, 139, 0.16)',
  },
  shape: { borderRadius: tokens.radius.md },
  shadows,
  typography: {
    fontFamily: '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.025em', fontSize: '1.9rem' },
    h5: { fontWeight: 700, letterSpacing: '-0.02em' },
    h6: { fontWeight: 700, letterSpacing: '-0.01em' },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600, letterSpacing: '0.01em' },
    body2: { lineHeight: 1.6 },
    caption: { color: slate[500] },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Klavye kullanıcıları için belirgin focus ring (erişilebilirlik)
        '*:focus-visible': {
          outline: `2px solid ${accent[500]}`,
          outlineOffset: '2px',
          borderRadius: '6px',
        },
        '::selection': { background: accent[200] },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 2 },
      styleOverrides: {
        root: {
          border: `1px solid ${slate[200]}`,
          backgroundImage: 'none',
          borderRadius: tokens.radius.lg,
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          paddingInline: 18,
          paddingBlock: 9,
          transition: 'all 0.18s ease',
        },
        containedPrimary: {
          background: tokens.gradient,
          boxShadow: 'none',
          '&:hover': { background: tokens.gradientHover, boxShadow: tokens.shadow.accent },
          '&:active': { transform: 'translateY(1px)' },
          '&.Mui-disabled': { background: slate[200], color: slate[400] },
        },
        outlined: { borderColor: slate[300], '&:hover': { borderColor: accent[400], background: accent[50] } },
        text: { '&:hover': { background: accent[50] } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { transition: 'all 0.18s ease', borderRadius: tokens.radius.sm },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-root': {
            borderRadius: tokens.radius.sm,
            backgroundColor: '#fff',
            transition: 'box-shadow 0.18s ease, border-color 0.18s ease',
            '& fieldset': { borderColor: slate[300] },
            '&:hover fieldset': { borderColor: slate[400] },
            '&.Mui-focused fieldset': { borderColor: accent[500], borderWidth: 1 },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${accent[500]}26` },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: tokens.radius.sm },
        outlined: { borderColor: slate[300] },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: tokens.radius.sm,
          transition: 'background-color 0.16s ease, transform 0.16s ease',
          '&:active': { transform: 'scale(0.99)' },
        },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { borderRadius: tokens.radius.pill, height: 8, backgroundColor: accent[100] },
        bar: { borderRadius: tokens.radius.pill, background: tokens.gradient },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: { borderRight: `1px solid ${slate[200]}`, backgroundColor: '#fff' },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: slate[800], borderRadius: 8, fontSize: 12, fontWeight: 500, padding: '6px 10px' },
        arrow: { color: slate[800] },
      },
    },
    MuiAccordion: {
      styleOverrides: {
        root: { borderRadius: `${tokens.radius.md}px !important`, border: `1px solid ${slate[200]}`, '&:before': { display: 'none' } },
      },
    },
    MuiDialog: {
      styleOverrides: { paper: { borderRadius: tokens.radius.lg } },
    },
  },
});

export default theme;
