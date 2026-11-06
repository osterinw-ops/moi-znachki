/**
 * Эмбеддинги эталонов каталога: build/ref/<id>.png →
 *   public/catalog/embeddings.json   (цветовой дескриптор + описание нейросетевых векторов)
 *   public/catalog/embeddings-nn.bin (векторы MobileNetV2, 8 поворотов на значок)
 * Используется тот же код, что и в приложении, поэтому векторы совместимы.
 * Запуск: npm run catalog:embed
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import * as ort from 'onnxruntime-web';
import { computeDescriptor, DESCRIPTOR_VERSION } from '../src/recognition/descriptor';
import { packVector, type EmbeddingsFile } from '../src/recognition/pack';
import { createSession, embed, packNN, NN_DIM, NN_VERSION } from '../src/recognition/nn';
import { rotate } from '../src/recognition/image';

const REF = 'build/ref';
const CATALOG = 'public/catalog/catalog.json';
const OUT = 'public/catalog/embeddings.json';
const NN_FILE = 'embeddings-nn.bin';
const MODEL = 'public/model/mnv2.onnx';
const VIEWS = 8; // повороты эталона через 45° — снимок с телефона может быть под любым углом

const require = createRequire(import.meta.url);
ort.env.wasm.wasmPaths = pathToFileURL(path.dirname(require.resolve('onnxruntime-web')) + '/').href;
ort.env.wasm.numThreads = 1;

const catalog = JSON.parse(fs.readFileSync(CATALOG, 'utf8'));
const out: EmbeddingsFile = { version: DESCRIPTOR_VERSION, catalogVersion: catalog.version, items: {} };
const refs = catalog.badges.map((b: { id: string }) => ({ id: b.id, img: PNG.sync.read(fs.readFileSync(path.join(REF, `${b.id}.png`))) }));
for (const r of refs) out.items[r.id] = packVector(computeDescriptor(r.img));

if (fs.existsSync(MODEL)) {
  const session = await createSession(ort, new Uint8Array(fs.readFileSync(MODEL)));
  const vectors: Float32Array[] = [];
  for (const r of refs) {
    const views = Array.from({ length: VIEWS }, (_, k) => rotate(r.img, (360 / VIEWS) * k));
    vectors.push(...(await embed(ort, session, views)));
  }
  fs.writeFileSync(path.join(path.dirname(OUT), NN_FILE), packNN(vectors));
  out.nn = { version: NN_VERSION, file: NN_FILE, dim: NN_DIM, views: VIEWS, order: refs.map((r: { id: string }) => r.id) };
} else {
  console.warn(`Нет модели ${MODEL} — только цветовой дескриптор`);
}

fs.writeFileSync(OUT, JSON.stringify(out));
console.log(`Эмбеддинги: ${refs.length} значков${out.nn ? ` × ${VIEWS} ракурсов (нейросеть)` : ''} → ${OUT}`);
