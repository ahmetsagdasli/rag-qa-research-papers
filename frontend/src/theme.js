import { createTheme } from '@mui/material/styles';


const theme = createTheme({
palette: {
mode: 'light',
primary: { main: '#1976d2' },
secondary: { main: '#9c27b0' },
background: { default: '#fafafa' }
},
shape: { borderRadius: 16 },
components: {
MuiCard: { styleOverrides: { root: { boxShadow: '0 6px 22px rgba(0,0,0,0.06)' } } }
}
});


export default theme;
