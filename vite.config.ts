import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// DEMO=1 → одна HTML-страница со вшитым каталогом (для показа без хостинга)
const demo = process.env.DEMO === '1';

export default defineConfig({
  base: './', // VK-хостинг отдаёт приложение из подпапки
  plugins: [react(), ...(demo ? [viteSingleFile()] : [])],
  resolve: {
    // движок нейросети без вшитого .wasm: файлы берутся из public/ort/ (см. recognize.ts)
    alias: { 'onnxruntime-web/wasm': fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) },
  },
  define: demo ? { 'import.meta.env.VITE_EMBED_CATALOG': JSON.stringify('1') } : {},
  publicDir: demo ? false : 'public',
  build: {
    outDir: demo ? 'dist-demo' : 'dist',
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
  },
});
