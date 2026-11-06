/**
 * Коллекции пользователя. Хранятся в VK Storage:
 *   v1_index         → {"c":["id1","id2"],"touch":"2026-11-06"}
 *   v1_c_<id>        → {"n":"Название","d":"описание","s":["Космос"],"w":[...],"o":[...]}
 *   v1_note_<badge>  → текст заметки пользователя о значке
 *   v1_b_<id>        → собственный значок пользователя (нет в каталоге):
 *                      {"n","s","y","d","img":dataURL 112px,"hc":дескриптор,"nn":вектор нейросети}
 *                      (≈8–10 КБ — kv.ts сам режет на части по 4 КБ)
 * s — отслеживаемые серии каталога, w — значки, добавленные в цель вручную,
 * o — значки, которые есть в наличии.
 */
import { useSyncExternalStore } from 'react';
import { kvGet, kvSet, kvFlush } from '../storage/kv';
import type { Catalog, Badge } from '../catalog/catalog';

export interface Collection {
  id: string;
  name: string;
  description: string;
  series: string[];
  wanted: string[];
  owned: string[];
  created: number;
}

/** Значок, который пользователь добавил сам (его нет в общем каталоге). */
export interface CustomBadge {
  id: string; // u_…
  name: string;
  series?: string;
  year?: number;
  description?: string;
  img: string; // data:image/jpeg;base64,…
  hc: string; // цветовой дескриптор (pack.ts)
  nn?: string; // вектор нейросети (nn.ts packNN, base64)
}

interface State {
  ready: boolean;
  collections: Collection[];
  notes: Record<string, string>;
  custom: CustomBadge[];
}

let state: State = { ready: false, collections: [], notes: {}, custom: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const update = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  emit();
};

export function useStore(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

const INDEX = 'v1_index';
const colKey = (id: string) => `v1_c_${id}`;
const noteKey = (badgeId: string) => `v1_note_${badgeId}`;
const badgeKey = (id: string) => `v1_b_${id}`;
const today = () => new Date().toISOString().slice(0, 10);
const REFRESH_DAYS = 30;

function serialize(c: Collection): string {
  return JSON.stringify({ n: c.name, d: c.description || undefined, s: c.series, w: c.wanted, o: c.owned, t: c.created });
}

function saveIndex(touch = today()) {
  kvSet(INDEX, JSON.stringify({ c: state.collections.map((c) => c.id), b: state.custom.map((b) => b.id), touch }));
}

export async function loadStore(): Promise<void> {
  const idx = (await kvGet([INDEX]))[INDEX];
  if (!idx) {
    update({ ready: true });
    return;
  }
  const { c: ids = [], b: bids = [], touch } = JSON.parse(idx) as { c: string[]; b?: string[]; touch?: string };
  const raw = await kvGet([...ids.map(colKey), ...bids.map(badgeKey)]);
  const custom: CustomBadge[] = [];
  for (const id of bids) {
    const v = raw[badgeKey(id)];
    if (!v) continue;
    try {
      const o = JSON.parse(v);
      custom.push({ id, name: o.n, series: o.s, year: o.y, description: o.d, img: o.img, hc: o.hc, nn: o.nn });
    } catch {
      /* повреждённая запись — пропускаем */
    }
  }
  const collections: Collection[] = [];
  for (const id of ids) {
    const v = raw[colKey(id)];
    if (!v) continue;
    const o = JSON.parse(v);
    collections.push({ id, name: o.n, description: o.d ?? '', series: o.s ?? [], wanted: o.w ?? [], owned: o.o ?? [], created: o.t ?? 0 });
  }
  update({ ready: true, collections, custom });

  // ключи VK Storage живут год — периодически продлеваем
  const age = touch ? (Date.now() - Date.parse(touch)) / 86400e3 : Infinity;
  if (age > REFRESH_DAYS) {
    collections.forEach((c) => kvSet(colKey(c.id), serialize(c)));
    custom.forEach((b) => kvSet(badgeKey(b.id), serializeBadge(b)));
    saveIndex();
  }
}

function serializeBadge(b: CustomBadge): string {
  return JSON.stringify({ n: b.name, s: b.series || undefined, y: b.year || undefined, d: b.description || undefined, img: b.img, hc: b.hc, nn: b.nn });
}

/** Сохранить собственный значок пользователя и вернуть его id. */
export function addCustomBadge(b: Omit<CustomBadge, 'id'>): string {
  const id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4);
  const full = { ...b, id };
  update({ custom: [...state.custom, full] });
  kvSet(badgeKey(id), serializeBadge(full));
  saveIndex();
  return id;
}

export function editCustomBadge(id: string, patch: Partial<Pick<CustomBadge, 'name' | 'series' | 'year' | 'description'>>) {
  const b = state.custom.find((x) => x.id === id);
  if (!b) return;
  const nb = { ...b, ...patch };
  update({ custom: state.custom.map((x) => (x.id === id ? nb : x)) });
  kvSet(badgeKey(id), serializeBadge(nb));
}

/** Удалить собственный значок отовсюду. */
export function deleteCustomBadge(id: string) {
  const collections = state.collections.map((c) => ({ ...c, owned: c.owned.filter((x) => x !== id), wanted: c.wanted.filter((x) => x !== id) }));
  update({ custom: state.custom.filter((x) => x.id !== id), collections });
  collections.forEach((c) => kvSet(colKey(c.id), serialize(c)));
  kvSet(badgeKey(id), '');
  kvSet(noteKey(id), '');
  saveIndex();
  void kvFlush();
}

export async function loadNote(badgeId: string): Promise<string> {
  if (badgeId in state.notes) return state.notes[badgeId];
  const v = (await kvGet([noteKey(badgeId)]))[noteKey(badgeId)] ?? '';
  update({ notes: { ...state.notes, [badgeId]: v } });
  return v;
}

export function saveNote(badgeId: string, text: string) {
  update({ notes: { ...state.notes, [badgeId]: text } });
  kvSet(noteKey(badgeId), text.trim());
}

function put(c: Collection) {
  const exists = state.collections.some((x) => x.id === c.id);
  update({ collections: exists ? state.collections.map((x) => (x.id === c.id ? c : x)) : [...state.collections, c] });
  kvSet(colKey(c.id), serialize(c));
  if (!exists) saveIndex();
}

export function createCollection(name: string, description: string, series: string[]): Collection {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const c: Collection = { id, name: name.trim(), description: description.trim(), series, wanted: [], owned: [], created: Date.now() };
  put(c);
  return c;
}

export function editCollection(id: string, patch: Partial<Pick<Collection, 'name' | 'description' | 'series'>>) {
  const c = state.collections.find((x) => x.id === id);
  if (c) put({ ...c, ...patch });
}

export function deleteCollection(id: string) {
  update({ collections: state.collections.filter((c) => c.id !== id) });
  kvSet(colKey(id), '');
  saveIndex();
  void kvFlush();
}

/** Отметить значок как имеющийся (и добавить в цель коллекции, если его там не было). */
export function addOwned(colId: string, badge: Badge) {
  const c = state.collections.find((x) => x.id === colId);
  if (!c) return;
  const inSeries = badge.series && c.series.includes(badge.series);
  put({
    ...c,
    owned: c.owned.includes(badge.id) ? c.owned : [...c.owned, badge.id],
    wanted: inSeries || c.wanted.includes(badge.id) ? c.wanted : [...c.wanted, badge.id],
  });
}

export function setOwned(colId: string, badgeId: string, owned: boolean) {
  const c = state.collections.find((x) => x.id === colId);
  if (!c) return;
  put({ ...c, owned: owned ? [...new Set([...c.owned, badgeId])] : c.owned.filter((x) => x !== badgeId) });
}

/** Добавить в цель (показывать контуром, пока нет в наличии). */
export function addWanted(colId: string, badgeId: string) {
  const c = state.collections.find((x) => x.id === colId);
  if (c && !c.wanted.includes(badgeId)) put({ ...c, wanted: [...c.wanted, badgeId] });
}

export function removeFromCollection(colId: string, badgeId: string) {
  const c = state.collections.find((x) => x.id === colId);
  if (!c) return;
  put({ ...c, owned: c.owned.filter((x) => x !== badgeId), wanted: c.wanted.filter((x) => x !== badgeId) });
}

/** Все значки коллекции: из отслеживаемых серий + добавленные вручную + имеющиеся. */
export function collectionBadges(c: Collection, catalog: Catalog): Badge[] {
  const ids = new Set<string>();
  for (const b of catalog.badges) if (b.series && c.series.includes(b.series)) ids.add(b.id);
  c.wanted.forEach((id) => ids.add(id));
  c.owned.forEach((id) => ids.add(id));
  return [...ids]
    .map((id) => catalog.byId.get(id))
    .filter((b): b is Badge => !!b)
    .sort((a, b) => (a.series ?? '').localeCompare(b.series ?? '') || (a.year ?? 0) - (b.year ?? 0) || a.name.localeCompare(b.name));
}

export function collectionStats(c: Collection, catalog: Catalog) {
  const all = collectionBadges(c, catalog);
  const owned = all.filter((b) => c.owned.includes(b.id)).length;
  return { total: all.length, owned, percent: all.length ? Math.round((100 * owned) / all.length) : 0 };
}

export function profileStats(collections: Collection[], catalog: Catalog) {
  const unique = new Set(collections.flatMap((c) => c.owned));
  let largest: { name: string; percent: number; total: number } | null = null;
  for (const c of collections) {
    const s = collectionStats(c, catalog);
    if (!largest || s.total > largest.total) largest = { name: c.name, percent: s.percent, total: s.total };
  }
  return { badges: unique.size, collections: collections.length, largest };
}
