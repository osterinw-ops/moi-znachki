/**
 * Хранилище «ключ → строка» поверх VK Storage (VKWebAppStorageGet/Set).
 *
 * Ограничения VK Storage: ключ ≤ 100 символов [a-zA-Z0-9_-], значение ≤ 4096 байт,
 * ≤ 1000 ключей на пользователя, ≤ 1000 вызовов в час, срок жизни ключа — 1 год.
 * Поэтому:
 *   • длинные значения режутся на части (key, key__1, key__2 …);
 *   • запись откладывается (debounce) и склеивается — меньше вызовов;
 *   • при запуске раз в 30 дней все ключи перезаписываются, чтобы не истекли.
 *
 * Вне ВКонтакте (обычный браузер, демо) используется localStorage.
 */
import bridge from '@vkontakte/vk-bridge';

const MAX_BYTES = 4000; // с запасом от 4096
const CHUNK_MARK = '@@chunks:';

export const inVK = (() => {
  try {
    return bridge.isEmbedded() || /[?&]vk_app_id=/.test(location.search);
  } catch {
    return false;
  }
})();

interface Backend {
  get(keys: string[]): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
}

const vkBackend: Backend = {
  async get(keys) {
    const out: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 100) {
      const res = await bridge.send('VKWebAppStorageGet', { keys: keys.slice(i, i + 100) });
      for (const k of res.keys) if (k.value) out[k.key] = k.value;
    }
    return out;
  },
  async set(key, value) {
    await bridge.send('VKWebAppStorageSet', { key, value });
  },
};

const memory = new Map<string, string>();
const localBackend: Backend = {
  async get(keys) {
    const out: Record<string, string> = {};
    for (const k of keys) {
      let v: string | null = memory.get(k) ?? null;
      try {
        v = localStorage.getItem('mz_' + k) ?? v;
      } catch { /* хранилище недоступно — работаем в памяти */ }
      if (v) out[k] = v;
    }
    return out;
  },
  async set(key, value) {
    if (value) memory.set(key, value); else memory.delete(key);
    try {
      if (value) localStorage.setItem('mz_' + key, value);
      else localStorage.removeItem('mz_' + key);
    } catch { /* ignore */ }
  },
};

const backend = inVK ? vkBackend : localBackend;

const byteLen = (s: string) => new TextEncoder().encode(s).length;

/** Режет строку на части не длиннее MAX_BYTES в UTF-8. */
function split(value: string): string[] {
  const parts: string[] = [];
  let cur = '';
  let curBytes = 0;
  for (const ch of value) {
    const b = byteLen(ch);
    if (curBytes + b > MAX_BYTES) {
      parts.push(cur);
      cur = '';
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts;
}

const chunkCount = new Map<string, number>(); // сколько частей было у ключа

export async function kvGet(keys: string[]): Promise<Record<string, string>> {
  const raw = await backend.get(keys);
  const extra: string[] = [];
  for (const k of keys) {
    const v = raw[k];
    if (v?.startsWith(CHUNK_MARK)) {
      const n = Number(v.slice(CHUNK_MARK.length));
      chunkCount.set(k, n);
      for (let i = 1; i < n; i++) extra.push(`${k}__${i}`);
    } else chunkCount.set(k, v ? 1 : 0);
  }
  const more = extra.length ? await backend.get(extra) : {};
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = raw[k];
    if (!v) continue;
    if (v.startsWith(CHUNK_MARK)) {
      // маркер «@@chunks:n» → данные в key__1 … key__(n-1)
      const n = chunkCount.get(k)!;
      let s = '';
      for (let i = 1; i < n; i++) s += more[`${k}__${i}`] ?? '';
      out[k] = s;
    } else out[k] = v;
  }
  return out;
}

async function writeNow(key: string, value: string) {
  const parts = value ? split(value) : [];
  const prev = chunkCount.get(key) ?? 0;
  if (parts.length <= 1) {
    await backend.set(key, parts[0] ?? '');
    for (let i = 1; i < prev; i++) await backend.set(`${key}__${i}`, '');
    chunkCount.set(key, parts.length);
    return;
  }
  // key хранит только маркер, данные — в key__1 … key__n
  for (let i = 0; i < parts.length; i++) await backend.set(`${key}__${i + 1}`, parts[i]);
  for (let i = parts.length + 1; i < prev; i++) await backend.set(`${key}__${i}`, '');
  await backend.set(key, CHUNK_MARK + (parts.length + 1));
  chunkCount.set(key, parts.length + 1);
}

const pending = new Map<string, string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let flushing: Promise<void> = Promise.resolve();

/** Отложенная запись (через 600 мс, последнее значение побеждает). Пустая строка — удаление. */
export function kvSet(key: string, value: string) {
  pending.set(key, value);
  clearTimeout(timer);
  timer = setTimeout(kvFlush, 600);
}

export function kvFlush(): Promise<void> {
  clearTimeout(timer);
  const batch = [...pending];
  pending.clear();
  flushing = flushing.then(async () => {
    for (const [k, v] of batch) {
      try {
        await writeNow(k, v);
      } catch (e) {
        console.error('VK Storage: не удалось записать', k, e);
        onError?.(e);
      }
    }
  });
  return flushing;
}

let onError: ((e: unknown) => void) | undefined;
export function onKvError(cb: (e: unknown) => void) {
  onError = cb;
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void kvFlush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void kvFlush();
  });
}
