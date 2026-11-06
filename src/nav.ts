/**
 * Простая навигация стеком панелей. Каждый переход кладёт запись в
 * window.history, поэтому системная кнопка «Назад» Android и свайп работают.
 */
import { useSyncExternalStore } from 'react';

export type Route =
  | { panel: 'home' }
  | { panel: 'collection'; colId: string }
  | { panel: 'editCollection'; colId?: string }
  | { panel: 'crop'; colId: string; imageUrl: string }
  | { panel: 'result'; colId: string; cropUrl: string; candidates: { id: string; score: number }[] }
  | { panel: 'badge'; colId: string; badgeId: string }
  | { panel: 'pick'; colId: string }
  | { panel: 'newBadge'; colId: string; cropUrl: string };

let stack: Route[] = [{ panel: 'home' }];
// ушедшие панели остаются смонтированными до конца анимации перехода —
// иначе View из VKUI не может завершить переход и блокирует нажатия
let ghosts: Route[] = [];
let snapshot: { stack: Route[]; ghosts: Route[] } = { stack, ghosts };
const listeners = new Set<() => void>();
const emit = () => {
  snapshot = { stack, ghosts };
  listeners.forEach((l) => l());
};

function retire(routes: Route[]) {
  ghosts = [...ghosts, ...routes];
  setTimeout(() => {
    ghosts = ghosts.filter((g) => !routes.includes(g));
    revokeUrls(routes);
    emit();
  }, 800);
}

export function useNav(): { stack: Route[]; ghosts: Route[] } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
}

// в некоторых встроенных браузерах history недоступна — тогда навигация без неё
let historyOk = true;
function safe(fn: () => void) {
  try {
    fn();
  } catch {
    historyOk = false;
  }
}

function popTo(depth: number) {
  if (depth < stack.length) {
    retire(stack.slice(Math.max(1, depth)));
    stack = stack.slice(0, Math.max(1, depth));
    emit();
  }
}

export function push(r: Route) {
  stack = [...stack, r];
  safe(() => history.pushState({ depth: stack.length }, ''));
  emit();
}

/** Заменить текущий экран (без новой записи в истории). */
export function replace(r: Route) {
  retire([stack[stack.length - 1]]);
  stack = [...stack.slice(0, -1), r];
  emit();
}

export function back() {
  if (stack.length <= 1) return;
  if (historyOk) history.back();
  else popTo(stack.length - 1);
}

/** Вернуться к экрану, удовлетворяющему условию (например, к коллекции после добавления). */
export function backTo(pred: (r: Route) => boolean) {
  const idx = stack.findLastIndex(pred);
  const steps = stack.length - 1 - idx;
  if (idx < 0 || steps <= 0) return;
  if (historyOk) history.go(-steps);
  else popTo(idx + 1);
}

window.addEventListener('popstate', (e) => {
  popTo((e.state?.depth as number | undefined) ?? 1);
});

function revokeUrls(routes: Route[]) {
  for (const r of routes) {
    if (r.panel === 'crop') URL.revokeObjectURL(r.imageUrl);
  }
}

safe(() => history.replaceState({ depth: 1 }, ''));
