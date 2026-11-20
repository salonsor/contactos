import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo la API va en otro proceso (server, puerto 3001)
    proxy: { '/api': 'http://localhost:3001' },
  },
});
