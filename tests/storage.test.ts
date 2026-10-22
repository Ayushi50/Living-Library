import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { emptyData } from '../src/lib/normalize';
import { LocalStorageAdapter, MemoryAdapter, SaveConflictError } from '../src/lib/storage';
import { Store } from '../src/lib/store';
import { AccountExistsError, SupabaseStorageAdapter } from '../src/lib/supabaseStorage';

type TestSession = { user: { id: string; email: string } } | null;

function makeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function makeClient(initialRow: unknown = null) {
  let row = initialRow as { data: unknown; updated_at?: string } | null;
  let session: TestSession = {
    user: { id: 'user-1', email: 'reader@example.com' },
  };
  let authListener: ((event: string, session: TestSession) => void) | undefined;
  const writes: unknown[] = [];
  const failures = { load: false, writes: false };
  let clientSubscriptions = 0;
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => (failures.load ? { data: null, error: new Error('network down') } : { data: row, error: null }),
    insert: async (value: { data: unknown; updated_at: string }) => {
      if (row) return { error: { code: '23505' } };
      row = value;
      writes.push(value);
      return { error: null };
    },
    update: (value: { data: unknown; updated_at: string }) => {
      const filters: Record<string, unknown> = {};
      const chain = {
        eq: (column: string, expected: unknown) => {
          filters[column] = expected;
          return chain;
        },
        select: async () => {
          if (failures.writes) return { data: null, error: new Error('network down') };
          if (!row || row.updated_at !== filters.updated_at) return { data: [], error: null };
          row = value;
          writes.push(value);
          return { data: [{ updated_at: value.updated_at }], error: null };
        },
      };
      return chain;
    },
  };
  const client = {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      signUp: async () => ({ data: { user: { identities: [] }, session: null }, error: null }),
      onAuthStateChange: (callback: typeof authListener) => {
        authListener = callback;
        clientSubscriptions++;
        return { data: { subscription: { unsubscribe: () => { authListener = undefined; } } } };
      },
    },
    from: () => query,
  } as unknown as SupabaseClient;
  return {
    client,
    writes,
    failures,
    subscriptions: () => clientSubscriptions,
    changeRemotely: (data: unknown) => { row = { data, updated_at: new Date(Date.now() + 5000).toISOString() }; },
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
  const fake = makeClient({ data: cloudData, updated_at: '2026-01-01T00:00:00.000Z' });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));

  const result = await adapter.load();

  assert.equal(result.data?.prefs.displayName, 'Cloud reader');
  assert.equal(fake.writes.length, 0);
});

test('a save cannot cross into a different signed-in account', async () => {
  const fake = makeClient({ data: emptyData(), updated_at: '2026-01-01T00:00:00.000Z' });
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
  const fake = makeClient({ data: cloudData, updated_at: '2026-01-01T00:00:00.000Z' });
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


test('a stale device cannot overwrite newer cloud data', async () => {
  const fake = makeClient({ data: emptyData(), updated_at: '2026-01-01T00:00:00.000Z' });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(makeStorage()));
  await adapter.load();
  await adapter.save(emptyData()); // fine: row unchanged since load
  fake.changeRemotely(emptyData()); // another device saves
  const writesBefore = fake.writes.length;

  await assert.rejects(adapter.save(emptyData()), SaveConflictError);
  assert.equal(fake.writes.length, writesBefore);
});


function guestLibraryJson() {
  const data = emptyData();
  data.books.push({ ...emptyBook(), title: 'Guest book' });
  return JSON.stringify(data);
}
function emptyBook() {
  const store = new Store(new MemoryAdapter(), 0);
  return store.addBook({ title: 'x' });
}

test('a guest library is offered once when the account already has data, then not again', async () => {
  const localStorage = makeStorage();
  localStorage.setItem('living-library:v1', guestLibraryJson());
  const fake = makeClient({ data: emptyData(), updated_at: '2026-01-01T00:00:00.000Z' });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));

  const first = await adapter.load();
  assert.equal(first.guest?.books.length, 1);
  assert.equal(first.data?.books.length, 0);

  adapter.resolveGuest();
  assert.equal((await adapter.load()).guest, undefined);
});

test('unsynced edits survive a failed save and are restored on the next load', async () => {
  const localStorage = makeStorage();
  const fake = makeClient({ data: emptyData(), updated_at: '2026-01-01T00:00:00.000Z' });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));
  await adapter.load();
  const edited = emptyData();
  edited.prefs.displayName = 'Offline edit';
  fake.failures.writes = true;
  await assert.rejects(adapter.save(edited), /network down/);

  fake.failures.writes = false;
  const reopened = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));
  const result = await reopened.load();
  assert.equal(result.data?.prefs.displayName, 'Offline edit');
  assert.equal(result.unsynced, true);
  await reopened.save(result.data!); // now syncs
  assert.equal(fake.writes.length, 1);
});

test('when the cloud is unreachable the on-device copy is shown', async () => {
  const localStorage = makeStorage();
  const fake = makeClient({ data: emptyData(), updated_at: '2026-01-01T00:00:00.000Z' });
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage));
  const loaded = await adapter.load();
  loaded.data!.prefs.displayName = 'Cached';
  await adapter.save(loaded.data!);

  fake.failures.load = true;
  const offline = await new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(localStorage)).load();
  assert.equal(offline.data?.prefs.displayName, 'Cached');
  assert.match(offline.notice ?? '', /offline/i);
});

test('signing up with an email that already has an account is reported', async () => {
  const fake = makeClient();
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(makeStorage()));
  await assert.rejects(adapter.signUpWithPassword('reader@example.com', 'password123'), AccountExistsError);
});

test('all auth listeners share one Supabase subscription', () => {
  const fake = makeClient();
  const adapter = new SupabaseStorageAdapter(fake.client, new LocalStorageAdapter(makeStorage()));
  const off1 = adapter.onAuthStateChange(() => {});
  const off2 = adapter.onAuthStateChange(() => {});
  assert.equal(fake.subscriptions(), 1);
  off1();
  off2();
});
