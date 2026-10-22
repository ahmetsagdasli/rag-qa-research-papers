import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';


export default defineConfig({
plugins: [react()],
test: { environment: 'jsdom', setupFiles: './src/test/setup.js', globals: true },
server: {
port: 5173,
proxy: {
// API_KEY set edilmişse (backend'deki ile aynı değer, shell'den export edilir) dev proxy header'ı ekler;
// böylece anahtar tarayıcıya hiç gitmez.
'/api': {
  target: 'http://localhost:5050',
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      if (process.env.API_KEY) proxyReq.setHeader('x-api-key', process.env.API_KEY);
    });
  }
},
'/docs': 'http://localhost:5050'
}
}
});
