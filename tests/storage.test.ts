import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyData } from '../src/lib/normalize';
import { LocalStorageAdapter } from '../src/lib/storage';
import { SupabaseStorageAdapter } from '../src/lib/supabaseStorage';

type TestSession = { user: { id: string; email: string } } | null;

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function makeClient(initialRow: unknown = null) {
  let row = initialRow;
  let session: TestSession = {
    user: { id: 'user-1', email: 'reader@example.com' },
  };
  let authListener: ((event: string, session: TestSession) => void) | undefined;
  const writes: unknown[] = [];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null }),
    upsert: async (value: unknown) => {
      row = value;
      writes.push(value);
      return { error: null };
    },
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      onAuthStateChange: (callback: typeof authListener) => {
        authListener = callback;
        return { data: { subscription: { unsubscribe: () => { authListener = undefined; } } } };
      },
    },
    from: () => query,
  } as unknown as SupabaseClient;
  return {
    client,
    writes,
    setSession: (next: TestSession) => {
      session = next;
      authListener?.(next ? 'SIGNED_IN' : 'SIGNED_OUT', next);
    },
  };
}

test('first sign-in migrates the local library when the account is empty', async () => {
  const localStorage = makeStorage();
  const localData = emptyData();
  localData.prefs.displayName = 'Local reader';
  localStorage.setItem('living-library:v1', JSON.stringify(localData));
  const fake = makeClient();
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));

  const result = await adapter.load();

  assert.equal(result.data?.prefs.displayName, 'Local reader');
  assert.equal(fake.writes.length, 1);
  assert.equal((fake.writes[0] as { user_id: string }).user_id, 'user-1');
});

test('an existing cloud library is loaded without overwriting local data', async () => {
  const localStorage = makeStorage();
  const localData = emptyData();
  localData.prefs.displayName = 'Local reader';
  localStorage.setItem('living-library:v1', JSON.stringify(localData));
  const cloudData = emptyData();
  cloudData.prefs.displayName = 'Cloud reader';
  const fake = makeClient({ data: cloudData });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));

  const result = await adapter.load();

  assert.equal(result.data?.prefs.displayName, 'Cloud reader');
  assert.equal(fake.writes.length, 0);
});

test('a save cannot cross into a different signed-in account', async () => {
  const fake = makeClient({ data: emptyData() });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(makeStorage()));
  await adapter.load();
  fake.setSession({ user: { id: 'user-2', email: 'other@example.com' } });

  await assert.rejects(adapter.save(emptyData()), /account changed/i);
  assert.equal(fake.writes.length, 0);
});

test('signing out and back into the same account restores its cloud library', async () => {
  const localStorage = makeStorage();
  const guestData = emptyData();
  guestData.prefs.displayName = 'Guest reader';
  localStorage.setItem('living-library:v1', JSON.stringify(guestData));
  const cloudData = emptyData();
  cloudData.prefs.displayName = 'Cloud reader';
  const fake = makeClient({ data: cloudData });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));
  const unsubscribe = adapter.onAuthStateChange(() => {});

  assert.equal((await adapter.load()).data?.prefs.displayName, 'Cloud reader');

  fake.setSession(null);
  assert.equal((await adapter.load()).data?.prefs.displayName, 'Guest reader');

  fake.setSession({ user: { id: 'user-1', email: 'reader@example.com' } });
  assert.equal((await adapter.load()).data?.prefs.displayName, 'Cloud reader');
  assert.equal(fake.writes.length, 0);

  unsubscribe();
});
test('auth listener reports a user change only when the account differs', async () => {
  const fake = makeClient();
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(makeStorage()));
  await adapter.load();
  const seen: boolean[] = [];
  adapter.onAuthStateChange((_event, _email, changed) => seen.push(changed));
  fake.setSession({ user: { id: 'user-1', email: 'reader@example.com' } }); // tab refocus, same user
  fake.setSession({ user: { id: 'user-2', email: 'other@example.com' } });
  fake.setSession(null);
  assert.deepEqual(seen, [false, true, true]);
});
