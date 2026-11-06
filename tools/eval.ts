/**
 * Проверка точности распознавания на синтетических фото (build/test/<id>__k.png).
 * Считает тем же кодом, что приложение: цвет, нейросеть и их сочетание.
 * Запуск: npm run eval
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { PNG } from 'pngjs';
import * as ort from 'onnxruntime-web';
import { computeDescriptor } from '../src/recognition/descriptor';
import { unpackVector, type EmbeddingsFile } from '../src/recognition/pack';
import { createSession, embed, unpackNN } from '../src/recognition/nn';
import { rankAll, type RefVectors } from '../src/recognition/rank';

const require = createRequire(import.meta.url);
ort.env.wasm.wasmPaths = pathToFileURL(path.dirname(require.resolve('onnxruntime-web')) + '/').href;
ort.env.wasm.numThreads = 1;

const emb: EmbeddingsFile = JSON.parse(fs.readFileSync('public/catalog/embeddings.json', 'utf8'));
const refs: RefVectors = { hc: new Map(Object.entries(emb.items).map(([id, s]) => [id, unpackVector(s)])) };
let session;
if (emb.nn) {
  const buf = fs.readFileSync(path.join('public/catalog', emb.nn.file));
  const flat = unpackNN(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), emb.nn.order.length * emb.nn.views, emb.nn.dim);
  refs.nn = new Map(emb.nn.order.map((id, i) => [id, flat.slice(i * emb.nn!.views, (i + 1) * emb.nn!.views)]));
  session = await createSession(ort, new Uint8Array(fs.readFileSync('public/model/mnv2.onnx')));
}

const files = fs.readdirSync('build/test').filter((f) => f.endsWith('.png')).sort();
const modes = refs.nn ? ['цвет', 'нейросеть', 'нейросеть + цвет'] : ['цвет'];
const stats = Object.fromEntries(modes.map((m) => [m, { t1: 0, t3: 0, errors: {} as Record<string, number> }]));
const okScores: number[] = [], badScores: number[] = [];
for (const f of files) {
  const truth = f.split('__')[0];
  const img = PNG.sync.read(fs.readFileSync(path.join('build/test', f)));
  const hc = computeDescriptor(img);
  const nnq = session ? (await embed(ort, session, [img]))[0] : undefined;
  for (const m of modes) {
    const ranked =
      m === 'цвет' ? rankAll({ hc: refs.hc }, hc)
      : m === 'нейросеть' ? rankAll({ hc: refs.hc, nn: refs.nn }, hc.map(() => 0) as Float32Array, nnq)
      : rankAll(refs, hc, nnq);
    const pos = ranked.findIndex((r) => r.id === truth);
    const st = stats[m];
    if (pos === 0) st.t1++;
    else st.errors[`${truth} → ${ranked[0].id}`] = (st.errors[`${truth} → ${ranked[0].id}`] ?? 0) + 1;
    if (pos < 3) st.t3++;
    if (m === modes[modes.length - 1]) (pos === 0 ? okScores : badScores).push(ranked[0].score);
  }
}
const pct = (n: number) => ((100 * n) / files.length).toFixed(1) + '%';
console.log(`Фото: ${files.length}, значков в каталоге: ${refs.hc.size}`);
for (const m of modes) console.log(`  ${m.padEnd(17)} top-1 ${pct(stats[m].t1)}  top-3 ${pct(stats[m].t3)}`);
const q = (a: number[], p: number) => a.sort((x, y) => x - y)[Math.floor(p * (a.length - 1))]?.toFixed(3);
console.log(`Сходство: верные p10=${q(okScores, 0.1)} p50=${q(okScores, 0.5)}; ошибочные p50=${q(badScores, 0.5)} p90=${q(badScores, 0.9)}`);
console.log('Частые ошибки:', Object.entries(stats[modes[modes.length - 1]].errors).sort((a, b) => b[1] - a[1]).slice(0, 8));
