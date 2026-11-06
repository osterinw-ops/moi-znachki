/**
 * Ранжирование кандидатов. Итоговое сходство:
 *   с нейросетью:  (nn + 0.3 · цвет) / 1.3
 *   без неё:       цвет
 * Вес 0.3 подобран на 40 реальных значках (top-1 91%, top-3 97% против 82/94 у одной нейросети).
 */
import { similarity } from './descriptor';

export const COLOR_WEIGHT = 0.3;

export interface RefVectors {
  hc: Map<string, Float32Array>;
  nn?: Map<string, Float32Array[]>; // несколько ракурсов на значок
}

export function rankAll(refs: RefVectors, hcQuery: Float32Array, nnQuery?: Float32Array): { id: string; score: number }[] {
  const out: { id: string; score: number }[] = [];
  const useNN = !!(nnQuery && refs.nn);
  for (const [id, hv] of refs.hc) {
    const hc = similarity(hcQuery, hv);
    let score = hc;
    if (useNN) {
      let best = -1;
      for (const v of refs.nn!.get(id) ?? []) best = Math.max(best, similarity(nnQuery!, v));
      score = best < 0 ? hc : (best + COLOR_WEIGHT * hc) / (1 + COLOR_WEIGHT);
    }
    out.push({ id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}
