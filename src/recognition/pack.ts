/** Компактное хранение векторов дескриптора: int8 + base64 (≈110 байт на значок). */
export function packVector(v: ArrayLike<number>): string {
  const bytes = new Uint8Array(v.length);
  for (let i = 0; i < v.length; i++) {
    const q = Math.max(-127, Math.min(127, Math.round(v[i] * 127 * 4)));
    bytes[i] = q & 0xff;
  }
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function unpackVector(s: string): Float32Array {
  const raw = atob(s);
  const v = new Float32Array(raw.length);
  let norm = 0;
  for (let i = 0; i < raw.length; i++) {
    let q = raw.charCodeAt(i);
    if (q > 127) q -= 256;
    v[i] = q / (127 * 4);
    norm += v[i] * v[i];
  }
  const k = norm > 0 ? 1 / Math.sqrt(norm) : 0;
  for (let i = 0; i < v.length; i++) v[i] *= k;
  return v;
}

export interface EmbeddingsFile {
  version: string; // версия цветового дескриптора
  catalogVersion: string;
  items: Record<string, string>; // id → дескриптор (base64)
  /** нейросетевые эмбеддинги (необязательно) */
  nn?: {
    version: string;
    file: string; // бинарный файл рядом с embeddings.json
    dim: number;
    views: number; // ракурсов (поворотов) на значок
    order: string[]; // id значков в порядке файла
  };
}
