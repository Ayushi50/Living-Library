import { createClient, type AuthChangeEvent, type SupabaseClient } from '@supabase/supabase-js';
import type { AppData } from '../types';
import { normalizeData } from './normalize';
import { LocalStorageAdapter, type StorageAdapter } from './storage';

const supabaseUrl = typeof __SUPABASE_URL__ === 'undefined' ? '' : __SUPABASE_URL__;
const supabaseAnonKey = typeof __SUPABASE_ANON_KEY__ === 'undefined' ? '' : __SUPABASE_ANON_KEY__;

export const supabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export class SupabaseStorageAdapter implements StorageAdapter {
  readonly name = 'Supabase cloud account';
  private loadedUserId: string | null | undefined;
  private email: string | null = null;

  constructor(
    private readonly client: SupabaseClient,
    private readonly local = new LocalStorageAdapter(),
  ) {}

  async load() {
    const { data: { session }, error: sessionError } = await this.client.auth.getSession();
    if (sessionError) throw sessionError;

    const user = session?.user;
    this.loadedUserId = user?.id ?? null;
    this.email = user?.email ?? null;
    if (!user) return this.local.load();

    const { data: row, error } = await this.client
      .from('user_libraries')
      .select('data')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;

    if (row) {
      const { data, skipped } = normalizeData(row.data);
      return {
        data,
        notice: skipped.length ? `${skipped.length} saved record(s) could not be read and were skipped.` : undefined,
      };
    }

    const local = await this.local.load();
    if (!local.data) return local;
    await this.saveForUser(user.id, local.data);
    return { data: local.data, notice: 'Your browser library was copied to your new cloud account.' };
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
    await this.saveForUser(userId, data);
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
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async signInWithGoogle() {
    const { error } = await this.client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }

  async signInWithPassword(email: string, password: string) {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /** Resolves true when the account is signed in straight away, false when email confirmation is still required. */
  async signUpWithPassword(email: string, password: string) {
    const { data, error } = await this.client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    if (error) throw error;
    return Boolean(data.session);
  }

  async signOut() {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
  }

  /**
   * `userChanged` is true only when the signed-in account really differs from the last one seen.
   * Supabase also fires SIGNED_IN when a tab regains focus or a token refreshes; those must not
   * reload the library (that would drop unsaved edits and flash the loading screen).
   */
  onAuthStateChange(callback: (event: AuthChangeEvent, email: string | null, userChanged: boolean) => void) {
    let lastUserId: string | null | undefined;
    const { data: { subscription } } = this.client.auth.onAuthStateChange((event, session) => {
      const userId = session?.user.id ?? null;
      this.email = session?.user.email ?? null;
      const known = lastUserId === undefined ? this.loadedUserId : lastUserId;
      const userChanged = (event === 'SIGNED_IN' || event === 'SIGNED_OUT') && known !== undefined && known !== userId;
      lastUserId = userId;
      callback(event, this.email, userChanged);
    });
    return () => subscription.unsubscribe();
  }

  private async saveForUser(userId: string, data: AppData) {
    const { error } = await this.client.from('user_libraries').upsert(
      { user_id: userId, data, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    );
    if (error) throw error;
  }
}

export const supabaseStorage = supabaseConfigured
  ? new SupabaseStorageAdapter(createClient(supabaseUrl, supabaseAnonKey))
  : null;