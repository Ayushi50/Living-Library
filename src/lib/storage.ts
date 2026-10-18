// Persistence boundary. The app talks to a `StorageAdapter`; today the only implementation is
// browser localStorage ("local development mode"). A cloud adapter (e.g. Supabase) can implement the
// same interface later — it is intentionally NOT included or claimed to work here.
import type { AppData } from '../types';
import { emptyData, normalizeData } from './normalize';

export interface StorageAdapter {
  readonly name: string;
  /** Resolve with saved data, or null when nothing has been saved yet. */
  load(): Promise<{ data: AppData | null; notice?: string }>;
  save(data: AppData): Promise<void>;
}

export const STORAGE_KEY = 'living-library:v1';

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'This browser (localStorage)';
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> = globalThis.localStorage) {}

  async load() {
    let raw: string | null = null;
    try {
      raw = this.storage.getItem(STORAGE_KEY);
    } catch {
      return { data: null, notice: 'Browser storage is unavailable, so changes will not be saved after you close this tab.' };
    }
    if (!raw) return { data: null };
    try {
      const { data, skipped } = normalizeData(JSON.parse(raw));
      return { data, notice: skipped.length ? `${skipped.length} saved record(s) could not be read and were skipped.` : undefined };
    } catch {
      // Keep the unreadable payload so nothing is lost, then start from an empty library.
      try {
        this.storage.setItem(`${STORAGE_KEY}:corrupt-${Date.now()}`, raw);
      } catch {
        /* ignore */
      }
      return { data: null, notice: 'Your saved library could not be read. A backup copy of the unreadable data was kept in this browser.' };
    }
  }

  async save(data: AppData) {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
}

export class MemoryAdapter implements StorageAdapter {
  readonly name = 'Memory';
  saved: AppData | null = null;
  async load() {
    return { data: this.saved };
  }
  async save(data: AppData) {
    this.saved = JSON.parse(JSON.stringify(data));
  }
}

export const freshData = emptyData;
