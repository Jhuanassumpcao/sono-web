import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.js';
import { mergeRemote, syncOnce } from '../src/sync.js';

let n = 0;
beforeEach(async () => {
  storage.closeDb();
  await storage.openDb(`sync-${++n}`);
});

/** Nuvem falsa: upsert com a regra "só grava se não for mais velho" e cursor por syncedAt do servidor. */
function fakeClient() {
  const tables = { folders: new Map(), exams: new Map(), attempts: new Map() };
  let tick = 0;
  return {
    tables, pushes: [], pullCursors: [], failNext: false, onPush: null,
    async push(table, rows) {
      if (this.failNext) { this.failNext = false; throw new Error('offline'); }
      this.pushes.push([table, rows.map((r) => r.id)]);
      if (this.onPush) await this.onPush();
      for (const r of rows) {
        const existing = tables[table].get(r.id);
        if (existing && existing.updatedAt > r.updatedAt) continue;
        tables[table].set(r.id, { ...r, syncedAt: ++tick });
      }
    },
    async pull(table, cursor = 0) {
      this.pullCursors.push([table, cursor]);
      const rows = [...tables[table].values()].filter((r) => r.syncedAt > cursor);
      const next = rows.length ? Math.max(...rows.map((r) => r.syncedAt)) : cursor;
      return { rows: rows.map(({ syncedAt, ...r }) => r), cursor: next };
    },
    seed(table, row) { tables[table].set(row.id, { ...row, syncedAt: ++tick }); },
  };
}

test('mergeRemote: newer wins, tie goes to the cloud, missing local takes remote', () => {
  const older = { id: 'x', updatedAt: 1, name: 'a' };
  const newer = { id: 'x', updatedAt: 2, name: 'b' };
  assert.equal(mergeRemote(older, newer), newer);
  assert.equal(mergeRemote(newer, older), newer);
  const tieLocal = { id: 'x', updatedAt: 2, name: 'local' };
  assert.equal(mergeRemote(tieLocal, newer), newer);
  assert.equal(mergeRemote(undefined, older), older);
});

test('push sends pending records and clears the outbox', async () => {
  const client = fakeClient();
  const f = await storage.createFolder('A', null);
  await storage.renameFolder(f.id, 'B');
  const r = await syncOnce({ storage, client });
  assert.equal(client.tables.folders.get(f.id).name, 'B');
  assert.deepEqual(client.pushes, [['folders', [f.id]]]);
  assert.deepEqual(await storage.getOutbox(), []);
  assert.equal(r.pushed, 1);
});

test('pull applies new remote records locally without re-queueing them', async () => {
  const client = fakeClient();
  client.seed('folders', { id: 'r1', parentId: null, name: 'Remota', updatedAt: 10 });
  const r = await syncOnce({ storage, client });
  assert.equal((await storage.listFolders())[0].name, 'Remota');
  assert.deepEqual(await storage.getOutbox(), []);
  assert.equal(r.pulled, 1);
  assert.equal(client.pushes.length, 0);
});

test('a newer remote edit wins over the local copy', async () => {
  const client = fakeClient();
  const f = await storage.createFolder('Local', null);
  await syncOnce({ storage, client });
  client.seed('folders', { id: f.id, parentId: null, name: 'Remoto', updatedAt: Date.now() + 60_000 });
  await syncOnce({ storage, client });
  assert.equal((await storage.listFolders())[0].name, 'Remoto');
});

test('an older remote copy does not overwrite a newer local edit', async () => {
  const client = fakeClient();
  await storage.applyRemote('folders', { id: 'x', parentId: null, name: 'LocalNovo', updatedAt: Date.now() + 60_000 });
  client.seed('folders', { id: 'x', parentId: null, name: 'RemotoVelho', updatedAt: 5 });
  await syncOnce({ storage, client });
  assert.equal((await storage.listFolders())[0].name, 'LocalNovo');
});

test('a remote tombstone hides the record locally', async () => {
  const client = fakeClient();
  await storage.applyRemote('exams', { id: 'e1', folderId: null, title: 'T', createdAt: 1, questions: [], updatedAt: 1 });
  client.seed('exams', { id: 'e1', folderId: null, title: 'T', createdAt: 1, questions: [], updatedAt: 9, deleted: true });
  await syncOnce({ storage, client });
  assert.equal(await storage.getExam('e1'), undefined);
});

test('a local deletion is pushed as a tombstone', async () => {
  const client = fakeClient();
  const f = await storage.createFolder('A', null);
  await syncOnce({ storage, client });
  await storage.deleteFolder(f.id);
  await syncOnce({ storage, client });
  assert.equal(client.tables.folders.get(f.id).deleted, true);
});

test('network failure keeps the outbox and the next sync succeeds', async () => {
  const client = fakeClient();
  const f = await storage.createFolder('A', null);
  client.failNext = true;
  await assert.rejects(() => syncOnce({ storage, client }), /offline/);
  assert.equal((await storage.getOutbox()).length, 1);
  await syncOnce({ storage, client });
  assert.deepEqual(await storage.getOutbox(), []);
  assert.ok(client.tables.folders.has(f.id));
});

test('writes made while a push is in flight stay in the outbox for the next sync', async () => {
  const client = fakeClient();
  const f = await storage.createFolder('A', null);
  client.onPush = async () => { client.onPush = null; await storage.renameFolder(f.id, 'Durante'); };
  await syncOnce({ storage, client });
  assert.equal((await storage.getOutbox()).length, 1);
  await syncOnce({ storage, client });
  assert.equal(client.tables.folders.get(f.id).name, 'Durante');
  assert.deepEqual(await storage.getOutbox(), []);
});

test('the pull cursor is remembered so only new rows are fetched next time', async () => {
  const client = fakeClient();
  client.seed('folders', { id: 'a', parentId: null, name: 'A', updatedAt: 1 });
  client.seed('folders', { id: 'b', parentId: null, name: 'B', updatedAt: 2 });
  await syncOnce({ storage, client });
  client.pullCursors.length = 0;
  client.seed('folders', { id: 'c', parentId: null, name: 'C', updatedAt: 3 });
  const r = await syncOnce({ storage, client });
  assert.equal(r.pulled, 1);
  assert.deepEqual(client.pullCursors.find(([t]) => t === 'folders'), ['folders', 2]);
  assert.equal((await storage.listFolders()).length, 3);
});

test('a failed pull leaves the failed table cursor unchanged and the next sync recovers', async () => {
  const client = fakeClient();
  client.seed('folders', { id: 'a', parentId: null, name: 'A', updatedAt: 1 });
  const original = client.pull.bind(client);
  client.pull = async (t, c) => { if (t === 'exams') throw new Error('boom'); return original(t, c); };
  await assert.rejects(() => syncOnce({ storage, client }), /boom/);
  assert.equal(await storage.getMeta('cursor:exams'), undefined);
  client.pull = original;
  await syncOnce({ storage, client });
  assert.equal((await storage.listFolders()).length, 1);
});
