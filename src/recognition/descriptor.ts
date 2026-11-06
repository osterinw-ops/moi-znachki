/**
 * Лёгкий дескриптор изображения значка — работает без нейросети и без сервера.
 *
 * Вход: квадратное RGBA-изображение, где значок вписан в круг (так кадрирует
 * экран съёмки и так подготовлены эталоны каталога).
 * Выход: L2-нормированный вектор; сходство двух значков = скалярное произведение.
 *
 * Признаки устойчивы к повороту (значок могут снять под любым углом), масштабу
 * и умеренным изменениям освещения:
 *   A — мягкая гистограмма цветов (тон × насыщенность + серые по яркости);
 *   B — радиальный профиль цвета (средний Lab по кольцам);
 *   C — гистограмма направлений границ относительно радиуса, по кольцам;
 *   D — модули гармоник Фурье яркости по окружности (инвариант к повороту).
 *
 * Тот же код используется в tools/embed.ts для эталонов, поэтому векторы
 * каталога и фото с камеры всегда совместимы. DESCRIPTOR_VERSION меняется
 * при любом изменении алгоритма.
 */
export const DESCRIPTOR_VERSION = 'hc-1';

export interface RGBAImage {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

const N = 96; // рабочее разрешение
const HUE_BINS = 12;
const RINGS_PROFILE = 6;
const RINGS_GRAD = 4;
const ORI_BINS = 4;
const RINGS_FFT = 4;
const ANGLES = 32;
const HARMONICS = 5;

/** Усреднение по площади до N×N. */
function resample(img: RGBAImage): Float32Array {
  const out = new Float32Array(N * N * 3);
  const sx = img.width / N;
  const sy = img.height / N;
  for (let y = 0; y < N; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < N; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let p = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, p += 4) {
          const a = img.data[p + 3] / 255;
          // прозрачные пиксели — нейтральный серый, как у эталонов
          r += img.data[p] * a + 128 * (1 - a);
          g += img.data[p + 1] * a + 128 * (1 - a);
          b += img.data[p + 2] * a + 128 * (1 - a);
          n++;
        }
      }
      const o = (y * N + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return out;
}

const lin = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);

/** sRGB → CIE Lab (D65). */
function toLab(rgb: Float32Array): Float32Array {
  const lab = new Float32Array(rgb.length);
  for (let i = 0; i < rgb.length; i += 3) {
    const r = lin(rgb[i]), g = lin(rgb[i + 1]), b = lin(rgb[i + 2]);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
    const Y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const fx = f(X), fy = f(Y), fz = f(Z);
    lab[i] = 116 * fy - 16;
    lab[i + 1] = 500 * (fx - fy);
    lab[i + 2] = 200 * (fy - fz);
  }
  return lab;
}

function l2(v: Float32Array | number[], weight = 1): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  const k = s > 0 ? weight / Math.sqrt(s) : 0;
  return Array.from(v, (x) => x * k);
}

export function computeDescriptor(img: RGBAImage): Float32Array {
  const lab = toLab(resample(img));
  const c = (N - 1) / 2;
  const R = N * 0.48;

  // нормализация яркости (компенсирует общий свет/экспозицию)
  let sumL = 0, sumL2 = 0, cnt = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (Math.hypot(x - c, y - c) > R) continue;
    const L = lab[(y * N + x) * 3];
    sumL += L; sumL2 += L * L; cnt++;
  }
  const meanL = sumL / cnt;
  const stdL = Math.sqrt(Math.max(1, sumL2 / cnt - meanL * meanL));
  const normL = (L: number) => 50 + ((L - meanL) / stdL) * 20;

  const hist = new Float32Array(HUE_BINS * 2 + 4);
  const prof = new Float32Array(RINGS_PROFILE * 3);
  const profW = new Float32Array(RINGS_PROFILE);
  const Lmap = new Float32Array(N * N);

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x;
    const rr = Math.hypot(x - c, y - c) / R;
    const L = normL(lab[i * 3]);
    Lmap[i] = L;
    if (rr > 1) continue;
    const w = rr < 0.8 ? 1 : Math.max(0, (1 - rr) / 0.2); // края весят меньше
    const a = lab[i * 3 + 1], b = lab[i * 3 + 2];
    const C = Math.hypot(a, b);

    // A: тон × насыщенность, серые — по яркости (мягкое распределение)
    const chromaW = Math.min(1, Math.max(0, (C - 8) / 10));
    if (chromaW > 0) {
      const h = ((Math.atan2(b, a) / (2 * Math.PI)) * HUE_BINS + HUE_BINS) % HUE_BINS;
      const h0 = Math.floor(h), t = h - h0, h1 = (h0 + 1) % HUE_BINS;
      const level = C > 40 ? 1 : 0;
      hist[level * HUE_BINS + h0] += w * chromaW * (1 - t);
      hist[level * HUE_BINS + h1] += w * chromaW * t;
    }
    if (chromaW < 1) {
      const lb = Math.min(3, Math.max(0, Math.floor((L / 100) * 4)));
      hist[HUE_BINS * 2 + lb] += w * (1 - chromaW);
    }

    // B: радиальный профиль
    const ring = Math.min(RINGS_PROFILE - 1, Math.floor(rr * RINGS_PROFILE));
    prof[ring * 3] += w * L; prof[ring * 3 + 1] += w * a; prof[ring * 3 + 2] += w * b;
    profW[ring] += w;
  }
  for (let r = 0; r < RINGS_PROFILE; r++) {
    const k = profW[r] > 0 ? 1 / profW[r] : 0;
    prof[r * 3] = (prof[r * 3] * k - 50) / 50;
    prof[r * 3 + 1] *= k / 60;
    prof[r * 3 + 2] *= k / 60;
  }

  // C: направления границ относительно радиуса
  const grad = new Float32Array(RINGS_GRAD * ORI_BINS);
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const dx0 = x - c, dy0 = y - c;
    const rr = Math.hypot(dx0, dy0) / R;
    if (rr > 0.95) continue;
    const p = (yy: number, xx: number) => Lmap[yy * N + xx];
    const gx = p(y - 1, x + 1) + 2 * p(y, x + 1) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y, x - 1) - p(y + 1, x - 1);
    const gy = p(y + 1, x - 1) + 2 * p(y + 1, x) + p(y + 1, x + 1) - p(y - 1, x - 1) - 2 * p(y - 1, x) - p(y - 1, x + 1);
    const m = Math.hypot(gx, gy);
    if (m < 8) continue;
    let rel = Math.atan2(gy, gx) - Math.atan2(dy0, dx0);
    rel = ((rel % Math.PI) + Math.PI) % Math.PI; // без знака
    const ob = Math.min(ORI_BINS - 1, Math.floor((rel / Math.PI) * ORI_BINS));
    const ring = Math.min(RINGS_GRAD - 1, Math.floor((rr / 0.95) * RINGS_GRAD));
    grad[ring * ORI_BINS + ob] += Math.sqrt(m);
  }

  // D: гармоники яркости по окружности
  const fft = new Float32Array(RINGS_FFT * HARMONICS);
  for (let r = 0; r < RINGS_FFT; r++) {
    const rad = R * (0.2 + (0.7 * (r + 0.5)) / RINGS_FFT);
    const s = new Float32Array(ANGLES);
    for (let k = 0; k < ANGLES; k++) {
      const ang = (2 * Math.PI * k) / ANGLES;
      const xx = Math.round(c + rad * Math.cos(ang));
      const yy = Math.round(c + rad * Math.sin(ang));
      s[k] = Lmap[yy * N + xx];
    }
    for (let h = 1; h <= HARMONICS; h++) {
      let re = 0, im = 0;
      for (let k = 0; k < ANGLES; k++) {
        const ang = (2 * Math.PI * h * k) / ANGLES;
        re += s[k] * Math.cos(ang); im += s[k] * Math.sin(ang);
      }
      fft[r * HARMONICS + h - 1] = Math.hypot(re, im) / ANGLES;
    }
  }

  const histH = Array.from(hist, (v) => Math.sqrt(v)); // Хеллингер
  const vec = [
    ...l2(histH, WEIGHTS.color),
    ...l2(prof, WEIGHTS.profile),
    ...l2(Array.from(grad, Math.sqrt), WEIGHTS.edges),
    ...l2(fft, WEIGHTS.harmonics),
  ];
  return Float32Array.from(l2(vec));
}

export const WEIGHTS = { color: 1.0, profile: 0.5, edges: 0.8, harmonics: 0.5 };

export function similarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
