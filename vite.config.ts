import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/webgpuclaude/' : '/',
  optimizeDeps: {
    exclude: ['three'],
  },
  server: {
    open: true,
  },
});
