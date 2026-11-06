import { CATALOG_URL } from '../config';
import { unpackVector, type EmbeddingsFile } from '../recognition/pack';
import { DESCRIPTOR_VERSION } from '../recognition/descriptor';
import { NN_VERSION, unpackNN } from '../recognition/nn';

export interface PaletteColor {
  hex: string;
  share: number;
}

export interface Badge {
  id: string;
  name: string;
  series?: string;
  year?: number;
  description?: string;
  img: string; // абсолютный URL цветного изображения
  palette: PaletteColor[];
  contour: string; // внутренняя разметка SVG (пути), viewBox — catalog.contourViewBox; пусто у своих значков
  custom?: boolean; // добавлен пользователем, а не из общего каталога
}

export interface Catalog {
  version: string;
  contourViewBox: string;
  series: string[];
  badges: Badge[];
  byId: Map<string, Badge>;
  vectors: Map<string, Float32Array>;
  /** векторы нейросети: несколько ракурсов на значок (если есть) */
  nnVectors?: Map<string, Float32Array[]>;
}

interface RawCatalog extends Omit<Catalog, 'byId' | 'vectors' | 'nnVectors'> {}

async function loadRaw(): Promise<{ raw: RawCatalog; emb: EmbeddingsFile; base: string; nnBin?: ArrayBuffer }> {
  if (import.meta.env.VITE_EMBED_CATALOG === '1') {
    // демо-сборка одним файлом: каталог вшит в бандл
    const m = await import('./embedded.generated');
    const b64 = (m as { nnBin?: string }).nnBin;
    const nnBin = b64 ? Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer : undefined;
    return { raw: m.catalog as RawCatalog, emb: m.embeddings as EmbeddingsFile, base: '', nnBin };
  }
  const base = new URL(CATALOG_URL, location.href).toString();
  const [raw, emb] = await Promise.all([
    fetch(base + 'catalog.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`каталог: HTTP ${r.status}`);
      return r.json();
    }),
    fetch(base + 'embeddings.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`эмбеддинги: HTTP ${r.status}`);
      return r.json();
    }),
  ]);
  let nnBin: ArrayBuffer | undefined;
  if ((emb as EmbeddingsFile).nn) {
    try {
      const r = await fetch(base + (emb as EmbeddingsFile).nn!.file);
      if (r.ok) nnBin = await r.arrayBuffer();
    } catch {
      /* без нейросетевых векторов распознаём по цвету */
    }
  }
  return { raw, emb, base, nnBin };
}

export async function loadCatalog(): Promise<Catalog> {
  const { raw, emb, base, nnBin } = await loadRaw();
  if (emb.version !== DESCRIPTOR_VERSION) {
    console.warn(`Эмбеддинги посчитаны версией ${emb.version}, приложение — ${DESCRIPTOR_VERSION}. Пересоберите каталог.`);
  }
  const badges = raw.badges.map((b) => ({ ...b, img: b.img.startsWith('data:') ? b.img : base + b.img }));
  const vectors = new Map<string, Float32Array>();
  for (const [id, s] of Object.entries(emb.items)) vectors.set(id, unpackVector(s));
  let nnVectors: Map<string, Float32Array[]> | undefined;
  if (emb.nn && nnBin && emb.nn.version === NN_VERSION) {
    const flat = unpackNN(nnBin, emb.nn.order.length * emb.nn.views, emb.nn.dim);
    nnVectors = new Map(emb.nn.order.map((id, i) => [id, flat.slice(i * emb.nn!.views, (i + 1) * emb.nn!.views)]));
  }
  return { ...raw, badges, byId: new Map(badges.map((b) => [b.id, b])), vectors, nnVectors };
}
