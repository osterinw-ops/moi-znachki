/** Общие операции над RGBA-изображениями — одинаковые в браузере и в Node (tools/embed.ts). */
import type { RGBAImage } from './descriptor';

/** Усреднение по площади до size×size; прозрачность смешивается с серым 128. */
export function resampleRGB(img: RGBAImage, size: number): Float32Array {
  const out = new Float32Array(size * size * 3);
  const sx = img.width / size;
  const sy = img.height / size;
  for (let y = 0; y < size; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < size; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) {
          const a = img.data[p + 3] / 255;
          r += img.data[p] * a + 128 * (1 - a);
          g += img.data[p + 1] * a + 128 * (1 - a);
          b += img.data[p + 2] * a + 128 * (1 - a);
          n++;
        }
      }
      const o = (y * size + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return out;
}

/** Поворот вокруг центра (билинейно), за краями — серый 128. */
export function rotate(img: RGBAImage, degrees: number): RGBAImage {
  const { width: w, height: h, data } = img;
  const out = new Uint8ClampedArray(w * h * 4);
  const a = (-degrees * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const px = (x: number, y: number, c: number) =>
    x < 0 || y < 0 || x >= w || y >= h ? (c === 3 ? 255 : 128) : c === 3 ? 255 : (() => {
      const p = (y * w + x) * 4;
      const al = data[p + 3] / 255;
      return data[p + c] * al + 128 * (1 - al);
    })();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = cos * (x - cx) - sin * (y - cy) + cx;
      const sy = sin * (x - cx) + cos * (y - cy) + cy;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] =
          px(x0, y0, c) * (1 - fx) * (1 - fy) + px(x0 + 1, y0, c) * fx * (1 - fy) +
          px(x0, y0 + 1, c) * (1 - fx) * fy + px(x0 + 1, y0 + 1, c) * fx * fy;
      }
      out[o + 3] = 255;
    }
  }
  return { data: out, width: w, height: h };
}
