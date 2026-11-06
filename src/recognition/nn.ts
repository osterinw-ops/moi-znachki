/**
 * Нейросетевой эмбеддинг значка: MobileNetV2 (ImageNet, ONNX), выход последнего
 * свёрточного слоя 7×7×1280 → GeM-пулинг (p=3) → L2-нормировка.
 * Работает на телефоне через onnxruntime-web (WebAssembly, без сервера).
 * Тот же код считает эмбеддинги каталога в Node (tools/embed.ts).
 */
import type { InferenceSession } from 'onnxruntime-web';
import type { RGBAImage } from './descriptor';
import { resampleRGB } from './image';

export const NN_VERSION = 'mnv2-gem3-1';
export const NN_DIM = 1280;
const SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

type Ort = typeof import('onnxruntime-web');

/** NCHW-тензор: значок в круге, за кругом нейтральный серый. */
export function preprocess(img: RGBAImage): Float32Array {
  const rgb = resampleRGB(img, SIZE);
  const out = new Float32Array(3 * SIZE * SIZE);
  const c = (SIZE - 1) / 2;
  const R2 = (SIZE * 0.49) ** 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x;
      const inside = (x - c) ** 2 + (y - c) ** 2 <= R2;
      for (let ch = 0; ch < 3; ch++) {
        const v = inside ? rgb[i * 3 + ch] / 255 : 0.5;
        out[ch * SIZE * SIZE + i] = (v - MEAN[ch]) / STD[ch];
      }
    }
  }
  return out;
}

export async function createSession(ort: Ort, model: string | Uint8Array): Promise<InferenceSession> {
  return ort.InferenceSession.create(model as never, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

export async function embed(ort: Ort, session: InferenceSession, imgs: RGBAImage[]): Promise<Float32Array[]> {
  const n = imgs.length;
  const input = new Float32Array(n * 3 * SIZE * SIZE);
  imgs.forEach((im, k) => input.set(preprocess(im), k * 3 * SIZE * SIZE));
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', input, [n, 3, SIZE, SIZE]) };
  const res = await session.run(feeds);
  const t = res[session.outputNames[0]];
  const [, C, H, W] = t.dims as number[];
  const data = t.data as Float32Array;
  const out: Float32Array[] = [];
  for (let k = 0; k < n; k++) {
    const v = new Float32Array(C);
    let norm = 0;
    for (let ch = 0; ch < C; ch++) {
      let s = 0;
      const base = (k * C + ch) * H * W;
      for (let p = 0; p < H * W; p++) {
        const x = Math.max(data[base + p], 1e-6);
        s += x * x * x;
      }
      v[ch] = Math.cbrt(s / (H * W));
      norm += v[ch] * v[ch];
    }
    const kk = 1 / Math.sqrt(norm);
    for (let ch = 0; ch < C; ch++) v[ch] *= kk;
    out.push(v);
  }
  return out;
}

/**
 * Бинарный файл эмбеддингов каталога:
 *   float32[count]        масштаб каждого вектора
 *   uint8[count × dim]    вектор / масштаб × 255
 * count = значков × ракурсов; порядок — как в embeddings.json → nn.order.
 */
export function packNN(vectors: Float32Array[]): Uint8Array {
  const n = vectors.length, dim = vectors[0].length;
  const buf = new Uint8Array(n * 4 + n * dim);
  const scales = new Float32Array(buf.buffer, 0, n);
  vectors.forEach((v, i) => {
    let m = 0;
    for (const x of v) m = Math.max(m, x);
    scales[i] = m || 1;
    for (let j = 0; j < dim; j++) buf[n * 4 + i * dim + j] = Math.round((v[j] / scales[i]) * 255);
  });
  return buf;
}

export function unpackNN(buf: ArrayBuffer, count: number, dim: number): Float32Array[] {
  const scales = new Float32Array(buf, 0, count);
  const bytes = new Uint8Array(buf, count * 4);
  const out: Float32Array[] = [];
  for (let i = 0; i < count; i++) {
    const v = new Float32Array(dim);
    let norm = 0;
    for (let j = 0; j < dim; j++) {
      v[j] = (bytes[i * dim + j] / 255) * scales[i];
      norm += v[j] * v[j];
    }
    const k = 1 / Math.sqrt(norm);
    for (let j = 0; j < dim; j++) v[j] *= k;
    out.push(v);
  }
  return out;
}
