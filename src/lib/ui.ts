// Tiny UI infrastructure: hash router, toasts, confirm dialogs and global overlay state.
import { useSyncExternalStore } from 'react';

/* ------------------------------------------------------------------ router */

export type Route =
  | { name: 'home' }
  | { name: 'library'; bookId?: string }
  | { name: 'journal' }
  | { name: 'screen'; mediaId?: string }
  | { name: 'stats' }
  | { name: 'settings' };

export function parsePath(path: string): Route {
  const [pathname] = path.split('?');
  const seg = pathname.split('/').filter(Boolean);
  switch (seg[0]) {
    case 'library':
      return seg[1] === 'b' && seg[2] ? { name: 'library', bookId: decodeURIComponent(seg[2]) } : { name: 'library' };
    case 'journal':
      return { name: 'journal' };
    case 'screen':
      return seg[1] === 'm' && seg[2] ? { name: 'screen', mediaId: decodeURIComponent(seg[2]) } : { name: 'screen' };
    case 'stats':
      return { name: 'stats' };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}
export const bookPath = (id: string) => `/library/b/${encodeURIComponent(id)}`;
export const mediaPath = (id: string) => `/screen/m/${encodeURIComponent(id)}`;

const readPath = () => (typeof location === 'undefined' ? '/' : location.hash.replace(/^#/, '') || '/');
let currentPath = readPath();
let navIndex = (typeof history !== 'undefined' && (history.state as { idx?: number } | null)?.idx) || 0;
const routeListeners = new Set<() => void>();
const emitRoute = () => routeListeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    currentPath = readPath();
    navIndex = (history.state as { idx?: number } | null)?.idx ?? 0;
    emitRoute();
  });
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  if (to === currentPath) return;
  if (opts.replace) history.replaceState({ idx: navIndex }, '', `#${to}`);
  else history.pushState({ idx: ++navIndex }, '', `#${to}`);
  currentPath = to;
  emitRoute();
}
/** Go back if the previous entry belongs to this app, otherwise replace with a fallback. */
export function goBack(fallback: string) {
  if (navIndex > 0) history.back();
  else navigate(fallback, { replace: true });
}
export function usePath(): string {
  return useSyncExternalStore(
    (fn) => {
      routeListeners.add(fn);
      return () => routeListeners.delete(fn);
    },
    () => currentPath,
  );
}
export function useRoute(): Route {
  return parsePath(usePath());
}

/* ------------------------------------------------------------------- state */

export type AddKind = 'book' | 'movie' | 'tv' | 'kdrama' | 'anime';
export interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'error';
}
interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger?: boolean;
  resolve: (ok: boolean) => void;
}
interface UiState {
  searchOpen: boolean;
  add: { open: boolean; kind: AddKind };
  toasts: Toast[];
  confirm?: ConfirmRequest;
  shelvesOpen: boolean;
  goalsOpen: boolean;
}
let ui: UiState = { searchOpen: false, add: { open: false, kind: 'book' }, toasts: [], shelvesOpen: false, goalsOpen: false };
const uiListeners = new Set<() => void>();
function setUi(patch: Partial<UiState>) {
  ui = { ...ui, ...patch };
  uiListeners.forEach((l) => l());
}
export function useUi(): UiState {
  return useSyncExternalStore(
    (fn) => {
      uiListeners.add(fn);
      return () => uiListeners.delete(fn);
    },
    () => ui,
  );
}

export const openSearch = () => setUi({ searchOpen: true });
export const closeSearch = () => setUi({ searchOpen: false });
export const openAdd = (kind: AddKind = 'book') => setUi({ add: { open: true, kind } });
export const closeAdd = () => setUi({ add: { ...ui.add, open: false } });
export const openShelves = () => setUi({ shelvesOpen: true });
export const closeShelves = () => setUi({ shelvesOpen: false });
export const openGoals = () => setUi({ goalsOpen: true });
export const closeGoals = () => setUi({ goalsOpen: false });

let toastId = 0;
export function toast(text: string, tone: Toast['tone'] = 'ok') {
  const id = ++toastId;
  setUi({ toasts: [...ui.toasts, { id, text, tone }] });
  setTimeout(() => dismissToast(id), tone === 'error' ? 6500 : 3200);
}
export function dismissToast(id: number) {
  setUi({ toasts: ui.toasts.filter((t) => t.id !== id) });
}

/** Promise-based confirmation used before every destructive action. */
export function confirmAction(opts: { title: string; body?: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    setUi({
      confirm: {
        title: opts.title,
        body: opts.body,
        confirmLabel: opts.confirmLabel ?? 'Confirm',
        danger: opts.danger ?? true,
        resolve: (v) => {
          setUi({ confirm: undefined });
          resolve(v);
        },
      },
    });
  });
}

/* ------------------------------------------------- tiny persisted UI prefs */
export function usePrefersReducedMotionMedia(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}
