import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { createRuntimeControlPlugin } from './runtime-control';

const port = Number(process.env.PORT ?? '5173');
if (!Number.isFinite(port) || port <= 0) throw new Error(`Invalid PORT value: ${process.env.PORT}`);
const basePath = process.env.BASE_PATH ?? '/';
const host = process.env.HOST ?? '127.0.0.1';

export default defineConfig({
  base: basePath,
  plugins: [createRuntimeControlPlugin(), react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: { outDir: path.resolve(import.meta.dirname, 'dist/public'), emptyOutDir: true },
  server: { port, strictPort: true, host, fs: { strict: true } },
  preview: { port, host },
});
