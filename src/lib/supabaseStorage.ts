import { createClient, type AuthChangeEvent, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '../types';
import { normalizeData } from './normalize';
import { LocalStorageAdapter, SaveConflictError, type LoadResult, type StorageAdapter } from './storage';

const supabaseUrl = typeof __SUPABASE_URL__ === 'undefined' ? '' : __SUPABASE_URL__;
const supabaseAnonKey = typeof __SUPABASE_ANON_KEY__ === 'undefined' ? '' : __SUPABASE_ANON_KEY__;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

type AuthCallback = (event: AuthChangeEvent, email: string | null, userChanged: boolean) => void;
type CacheEntry = { data: AppData; baseVersion: string | null; dirty: boolean };

const appOrigin = () => globalThis.location?.origin ?? '';
const cacheKey = (userId: string) => `living-library:cache:${userId}`;
const guestKey = (userId: string) => `living-library:guest-handled:${userId}`;
const hasContent = (d: AppData) => d.books.length + d.media.length + d.journal.length + d.sessions.length > 0;
const signature = (d: AppData) => String(JSON.stringify(d).length);
const sameInstant = (a: string | null, b: string | null) => a !== null && b !== null && Date.parse(a) === Date.parse(b);

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = 'Supabase cloud account';
  private loadedUserId: string | null | undefined;
  private email: string | null = null;
  /** `updated_at` of the cloud row as last loaded or saved; null when the account has no row yet. */
  private version: string | null = null;
  private pendingGuestSignature: string | null = null;
  private authListeners = new Set<AuthCallback>();
  private authSubscription: { unsubscribe(): void } | null = null;
  private lastUserId: string | null | undefined;
  /** True between opening a password-recovery link and choosing a new password. */
  recovering = false;

  constructor(
    private readonly client: SupabaseClient,
    private readonly local = new LocalStorageAdapter(),
  ) {}

  /* ---- local mirror: lets edits survive a failed or offline save ---- */
  private readCache(userId: string): CacheEntry | null {
    const raw = this.local.readKey(cacheKey(userId));
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CacheEntry;
      const { data } = normalizeData(parsed.data);
      return { data, baseVersion: parsed.baseVersion ?? null, dirty: Boolean(parsed.dirty) };
    } catch {
      return null;
    }
  }
  private writeCache(userId: string, entry: CacheEntry) {
    this.local.writeKey(cacheKey(userId), JSON.stringify(entry));
  }

  async load(): Promise<LoadResult> {
    const { data: { session }, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;

    const user = session?.user;
    this.loadedUserId = user?.id ?? null;
    this.email = user?.email ?? null;
    this.version = null;
    this.pendingGuestSignature = null;
    if (!user) return this.local.load();

    const cached = this.readCache(user.id);
    const { data: row, error } = await this.client
      .from('user_libraries')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) {
      if (!cached) throw error;
      this.version = cached.baseVersion;
      return {
        data: cached.data,
        unsynced: cached.dirty,
        notice: 'You’re offline. Your changes are kept on this device and will sync when you reconnect.',
      };
    }

    if (row) {
      this.version = row.updated_at ?? null;
      let { data, skipped } = normalizeData(row.data);
      const notes: string[] = [];
      if (skipped.length) notes.push(`${skipped.length} saved record(s) could not be read and were skipped.`);

      let unsynced = false;
      if (cached?.dirty) {
        if (sameInstant(cached.baseVersion, this.version)) {
          data = cached.data;
          unsynced = true;
          notes.push('Restored changes from this device that hadn’t synced yet.');
        } else {
          this.local.writeKey(`${cacheKey(user.id)}:conflict`, JSON.stringify(cached));
          notes.push('Some changes made offline couldn’t be applied because your library was updated on another device.');
        }
      }
      if (!unsynced) this.writeCache(user.id, { data, baseVersion: this.version, dirty: false });

      const guest = await this.guestLibrary(user.id);
      return { data, unsynced, guest, notice: notes.join(' ') || undefined };
    }

    const local = await this.local.load();
    if (!local.data) return local;
    await this.saveForUser(user.id, local.data);
    this.local.writeKey(guestKey(user.id), signature(local.data));
    this.writeCache(user.id, { data: local.data, baseVersion: this.version, dirty: false });
    return { data: local.data };
  }

  /** The signed-out library on this browser, when it has content that was never merged into this account. */
  private async guestLibrary(userId: string) {
    const { data } = await this.local.load();
    if (!data || !hasContent(data)) return undefined;
    const sig = signature(data);
    if (this.local.readKey(guestKey(userId)) === sig) return undefined;
    this.pendingGuestSignature = sig;
    return data;
  }

  resolveGuest() {
    if (this.loadedUserId && this.pendingGuestSignature) this.local.writeKey(guestKey(this.loadedUserId), this.pendingGuestSignature);
    this.pendingGuestSignature = null;
  }

  async save(data: AppData) {
    const userId = this.loadedUserId;
    if (!userId) {
      await this.local.save(data);
      return;
    }

    const { data: { session }, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (session?.user.id !== userId || this.loadedUserId !== userId) {
      throw new Error('Your account changed before this save completed. Reload the library and try again.');
    }
    this.writeCache(userId, { data, baseVersion: this.version, dirty: true });
    await this.saveForUser(userId, data);
    this.writeCache(userId, { data, baseVersion: this.version, dirty: false });
  }

  async getCurrentEmail() {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    this.email = data.session?.user.email ?? null;
    return this.email;
  }

  async sendSignInLink(email: string) {
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: appOrigin() },
    });
    if (error) throw error;
  }

  async signInWithGoogle() {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: appOrigin() },
    });
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /**
   * Resolves true when the account is signed in straight away, false when email confirmation is still
   * required. Throws when the email already belongs to an account: Supabase answers that case with a
   * success-shaped response (to avoid leaking which emails exist) whose user has no identities.
   */
  async signUpWithPassword(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: appOrigin() } });
    if (error) throw error;
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new AccountExistsError();
    return Boolean(data.session);
  }

  async sendPasswordReset(email: string) {
    const { error } = await this.client.auth.resetPasswordForEmail(email, { redirectTo: appOrigin() });
    if (error) throw error;
  }

  async updatePassword(password: string) {
    const { error } = await this.client.auth.updateUser({ password });
    if (error) throw error;
    this.recovering = false;
  }

  async signOut() {
    const userId = this.loadedUserId;
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    this.recovering = false;
    // Drop the on-device mirror unless it still holds edits that never reached the account.
    if (userId && !this.readCache(userId)?.dirty) this.local.writeKey(cacheKey(userId), null);
  }

  /**
   * One shared Supabase subscription fans out to every listener, so they all agree on what counts as a
   * change of account. `userChanged` is true only when the signed-in user really differs from the last
   * one seen: Supabase also fires SIGNED_IN when a tab regains focus or a token refreshes, and those
   * must not reload the library (that would drop unsaved edits and flash the loading screen).
   */
  onAuthStateChange(callback: AuthCallback) {
    this.authListeners.add(callback);
    if (!this.authSubscription) {
      const { data: { subscription } } = this.client.auth.onAuthStateChange((event, session) => {
        const userId = session?.user.id ?? null;
        this.email = session?.user.email ?? null;
        if (event === 'PASSWORD_RECOVERY') this.recovering = true;
        const known = this.lastUserId === undefined ? this.loadedUserId : this.lastUserId;
        const userChanged = (event === 'SIGNED_IN' || event === 'SIGNED_OUT') && known !== undefined && known !== userId;
        this.lastUserId = userId;
        this.authListeners.forEach((listener) => listener(event, this.email, userChanged));
      });
      this.authSubscription = subscription;
    }
    return () => {
      this.authListeners.delete(callback);
      if (!this.authListeners.size) {
        this.authSubscription?.unsubscribe();
        this.authSubscription = null;
      }
    };
  }

  /**
   * Optimistic concurrency: the write only succeeds if the cloud row still has the `updated_at` we
   * last saw, so a stale device can never silently overwrite newer work from another one.
   */
  private async saveForUser(userId: string, data: AppData) {
    let next = new Date().toISOString();
    if (next === this.version) next = new Date(Date.now() + 1).toISOString();

    if (this.version === null) {
      const { error } = await this.client.from('user_libraries').insert({ user_id: userId, data, updated_at: next });
      if (error?.code === '23505') throw new SaveConflictError();
      if (error) throw error;
    } else {
      const { data: rows, error } = await this.client
        .from('user_libraries')
        .update({ data, updated_at: next })
        .eq('user_id', userId)
        .eq('updated_at', this.version)
        .select('updated_at');
      if (error) throw error;
      if (!rows?.length) throw new SaveConflictError();
    }
    this.version = next;
  }
}

export class AccountExistsError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'AccountExistsError';
  }
}

export const supabaseStorage = supabaseConfigured
  ? new SupabaseStorageAdapter(createClient(supabaseUrl, supabaseAnonKey))
  : null;