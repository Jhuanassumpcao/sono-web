import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.js';
import { decideAccountAction, resolveAccount } from '../src/account-flow.js';

let n = 0;
beforeEach(async () => {
  storage.closeDb();
  await storage.openDb(`account-${++n}`);
});

const asker = (over = {}) => ({
  calls: [],
  async upload(count) { this.calls.push(['upload', count]); return over.upload ?? true; },
  async switchAccount(info) { this.calls.push(['switch', info]); return over.switchAccount ?? 'backup'; },
  async backup() { this.calls.push(['backup']); },
});

test('decideAccountAction covers every situation', () => {
  assert.deepEqual(decideAccountAction({ localUserId: 'u1', sessionUserId: 'u1', localCount: 5, outboxCount: 0 }), { action: 'sync' });
  assert.deepEqual(decideAccountAction({ localUserId: undefined, sessionUserId: 'u1', localCount: 0, outboxCount: 0 }), { action: 'sync' });
  assert.deepEqual(decideAccountAction({ localUserId: undefined, sessionUserId: 'u1', localCount: 3, outboxCount: 0 }), { action: 'ask-upload' });
  assert.deepEqual(decideAccountAction({ localUserId: 'u1', sessionUserId: 'u2', localCount: 3, outboxCount: 2 }), { action: 'switch-account', hasUnsynced: true });
  assert.deepEqual(decideAccountAction({ localUserId: 'u1', sessionUserId: 'u2', localCount: 0, outboxCount: 0 }), { action: 'switch-account', hasUnsynced: false });
});

test('first login with local data and "yes" queues everything for upload', async () => {
  const f = await storage.createFolder('Local', null);
  await storage.clearOutbox(Infinity);
  const ask = asker({ upload: true });
  assert.equal(await resolveAccount({ storage, userId: 'u1', ask }), 'ready');
  assert.deepEqual(ask.calls, [['upload', 1]]);
  assert.deepEqual((await storage.getOutbox()).map((o) => o.id), [f.id]);
  assert.equal(await storage.getMeta('userId'), 'u1');
});

test('first login with local data and "no" keeps data local and does not queue it', async () => {
  await storage.createFolder('Local', null);
  await storage.clearOutbox(Infinity);
  assert.equal(await resolveAccount({ storage, userId: 'u1', ask: asker({ upload: false }) }), 'ready');
  assert.deepEqual(await storage.getOutbox(), []);
  assert.equal((await storage.listFolders()).length, 1);
  assert.equal(await storage.getMeta('userId'), 'u1');
});

test('first login with no local data does not ask anything', async () => {
  const ask = asker();
  assert.equal(await resolveAccount({ storage, userId: 'u1', ask }), 'ready');
  assert.deepEqual(ask.calls, []);
  assert.equal(await storage.getMeta('userId'), 'u1');
});

test('same account again just syncs without asking', async () => {
  await storage.setMeta('userId', 'u1');
  await storage.createFolder('A', null);
  const ask = asker();
  assert.equal(await resolveAccount({ storage, userId: 'u1', ask }), 'ready');
  assert.deepEqual(ask.calls, []);
  assert.equal((await storage.listFolders()).length, 1);
});

test('switching account with backup downloads it, wipes local data and adopts the new account', async () => {
  await storage.setMeta('userId', 'u1');
  await storage.createFolder('Da conta 1', null);
  const ask = asker({ switchAccount: 'backup' });
  assert.equal(await resolveAccount({ storage, userId: 'u2', ask }), 'ready');
  assert.deepEqual(ask.calls.map((c) => c[0]), ['switch', 'backup']);
  assert.equal(ask.calls[0][1].hasUnsynced, true);
  assert.deepEqual(await storage.listFolders(), []);
  assert.equal(await storage.getMeta('userId'), 'u2');
});

test('switching account without backup still wipes and adopts', async () => {
  await storage.setMeta('userId', 'u1');
  await storage.createFolder('Da conta 1', null);
  const ask = asker({ switchAccount: 'discard' });
  assert.equal(await resolveAccount({ storage, userId: 'u2', ask }), 'ready');
  assert.deepEqual(ask.calls.map((c) => c[0]), ['switch']);
  assert.deepEqual(await storage.listFolders(), []);
});

test('cancelling the account switch changes nothing', async () => {
  await storage.setMeta('userId', 'u1');
  await storage.createFolder('Da conta 1', null);
  const ask = asker({ switchAccount: 'cancel' });
  assert.equal(await resolveAccount({ storage, userId: 'u2', ask }), 'cancelled');
  assert.equal((await storage.listFolders()).length, 1);
  assert.equal(await storage.getMeta('userId'), 'u1');
});
