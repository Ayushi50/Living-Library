// Persistence boundary. LocalStorageAdapter is used for guest libraries and migration; when
// configured, the Supabase adapter stores each signed-in user's library in the cloud.
import type { AppData } from '../types';
import { emptyData, normalizeData } from './normalize';

export interface StorageAdapter {
  readonly name: string;
  /** Resolve with saved data, or null when nothing has been saved yet. */
  load(): Promise<LoadResult>;
  save(data: AppData): Promise<void>;
  /** Marks the guest library offered in `LoadResult.guest` as dealt with, so it is not offered again. */
  resolveGuest?(): void;
}

export interface LoadResult {
  data: AppData | null;
  notice?: string;
  /** A guest (signed-out) library on this browser that is not yet part of the loaded account. */
  guest?: AppData;
  /** `data` holds edits made on this device that never reached the cloud; they should be saved again. */
  unsynced?: boolean;
}

/** Thrown when a save would overwrite changes made elsewhere (another device or tab). */
export class SaveConflictError extends Error {
  constructor() {
    super('This library was changed on another device or tab.');
    this.name = 'SaveConflictError';
  }
}

export const STORAGE_KEY = 'living-library:v1';

export class LocalStorageAdapter implements StorageAdapter {
  readonly name = 'This browser (localStorage)';
  constructor(private readonly storage: Pick<Storage, 'getItem' | 'setItem'> & Partial<Pick<Storage, 'removeItem'>> = globalThis.localStorage) {}

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

  /** Small side-channel for bookkeeping that must live next to the library (never throws). */
  readKey(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }
  writeKey(key: string, value: string | null) {
    try {
      if (value === null) this.storage.removeItem?.(key);
      else this.storage.setItem(key, value);
    } catch {
      /* ignore */
    }
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
