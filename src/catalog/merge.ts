import type { Badge, Catalog } from './catalog';
import type { CustomBadge } from '../store/collections';
import { unpackVector } from '../recognition/pack';
import { NN_DIM, unpackNN } from '../recognition/nn';

const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

/** Общий каталог + собственные значки пользователя (они участвуют и в сетке, и в распознавании). */
export function mergeCustom(base: Catalog, custom: CustomBadge[]): Catalog {
  if (!custom.length) return base;
  const extra: Badge[] = custom.map((c) => ({
    id: c.id,
    name: c.name,
    series: c.series,
    year: c.year,
    description: c.description,
    img: c.img,
    palette: [],
    contour: '',
    custom: true,
  }));
  const vectors = new Map(base.vectors);
  const nnVectors = base.nnVectors ? new Map(base.nnVectors) : undefined;
  for (const c of custom) {
    try {
      vectors.set(c.id, unpackVector(c.hc));
      if (nnVectors && c.nn) nnVectors.set(c.id, unpackNN(fromB64(c.nn), 1, NN_DIM));
    } catch {
      /* без векторов значок просто не будет распознаваться */
    }
  }
  const badges = [...base.badges, ...extra];
  const series = [...base.series];
  for (const b of extra) if (b.series && !series.includes(b.series)) series.push(b.series);
  return { ...base, badges, series, byId: new Map(badges.map((b) => [b.id, b])), vectors, nnVectors };
}
