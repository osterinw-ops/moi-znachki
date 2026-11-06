// Копирует движок нейросети в public/ort/ (работает в Windows, macOS и Linux)
import fs from 'node:fs';
const src = 'node_modules/onnxruntime-web/dist/';
fs.mkdirSync('public/ort', { recursive: true });
for (const f of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) fs.copyFileSync(src + f, 'public/ort/' + f);
console.log('Движок нейросети скопирован в public/ort/');
