import type { InferenceSession } from 'onnxruntime-web';
import type { Catalog, Badge } from '../catalog/catalog';
import { MODEL_URL } from '../config';
import { computeDescriptor } from './descriptor';
import { createSession, embed } from './nn';
import { rankAll } from './rank';

export interface Candidate {
  badge: Badge;
  score: number; // 0…1
}

type Ort = typeof import('onnxruntime-web');
let model: Promise<{ ort: Ort; session: InferenceSession } | null> | null = null;

/**
 * Загружает нейросеть в фоне (≈9 МБ модель + ≈15 МБ движок, дальше из кэша).
 * Если телефон не тянет WebAssembly или нет сети — распознавание
 * продолжит работать по цветовому дескриптору.
 */
export function warmUpModel(): Promise<{ ort: Ort; session: InferenceSession } | null> {
  model ??= (async () => {
    try {
      const ort = (await import('onnxruntime-web/wasm')) as unknown as Ort;
      ort.env.wasm.wasmPaths = new URL('./ort/', location.href).href;
      ort.env.wasm.numThreads = 1; // в iframe ВКонтакте нет SharedArrayBuffer
      const bytes = new Uint8Array(await (await fetch(new URL(MODEL_URL, location.href))).arrayBuffer());
      const session = await createSession(ort, bytes);
      return { ort, session };
    } catch (e) {
      console.warn('Нейросеть недоступна, распознаём по цвету:', e);
      return null;
    }
  })();
  return model;
}

export function modelState(): 'idle' | 'loading' | 'ready' | 'failed' {
  return state;
}
let state: 'idle' | 'loading' | 'ready' | 'failed' = 'idle';
export function trackModel(onChange: (s: typeof state) => void) {
  if (state === 'idle') state = 'loading';
  onChange(state);
  warmUpModel().then((m) => {
    state = m ? 'ready' : 'failed';
    onChange(state);
  });
}

/** Векторы кадра 256×256: цветовой дескриптор и (если модель загрузилась) нейросетевой. */
export async function describe(canvas: HTMLCanvasElement, withNN = true): Promise<{ hc: Float32Array; nn?: Float32Array }> {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hc = computeDescriptor(img);
  let nn: Float32Array | undefined;
  if (withNN) {
    const m = await warmUpModel();
    if (m) [nn] = await embed(m.ort, m.session, [img]);
  }
  return { hc, nn };
}

/** Распознавание на устройстве: кадр 256×256 → ближайшие значки каталога. */
export async function recognize(canvas: HTMLCanvasElement, catalog: Catalog, topK = 6): Promise<Candidate[]> {
  const { hc, nn: nnq } = await describe(canvas, !!catalog.nnVectors);
  return rankAll({ hc: catalog.vectors, nn: catalog.nnVectors }, hc, nnq)
    .slice(0, topK)
    .map((r) => ({ badge: catalog.byId.get(r.id)!, score: r.score }))
    .filter((c) => c.badge);
}
