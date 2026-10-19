import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyncManager } from '../src/sync-manager.js';

/** Relógio falso: guarda a função agendada para o teste disparar à mão. */
function fakeTimers() {
  const t = { fn: null, scheduled: 0, cleared: 0 };
  t.schedule = (fn) => { t.fn = fn; t.scheduled++; return t.scheduled; };
  t.clear = () => { t.fn = null; t.cleared++; };
  t.fire = async () => { const f = t.fn; t.fn = null; await f?.(); };
  return t;
}

function setup(over = {}) {
  const timers = fakeTimers();
  const statuses = [];
  let syncCalls = 0;
  const mgr = createSyncManager({
    sync: over.sync ?? (async () => { syncCalls++; }),
    getPending: over.getPending ?? (async () => 0),
    isOnline: over.isOnline ?? (() => true),
    onStatus: (s) => statuses.push(s),
    schedule: timers.schedule, clear: timers.clear, debounceMs: 2000,
  });
  return { mgr, timers, statuses, calls: () => syncCalls };
}

test('does nothing while disabled', async () => {
  const { mgr, timers, calls } = setup();
  mgr.request();
  assert.equal(timers.scheduled, 0);
  await mgr.syncNow();
  assert.equal(calls(), 0);
});

test('several requests coalesce into one debounced sync', async () => {
  const { mgr, timers, calls } = setup();
  mgr.setEnabled(true);
  mgr.request();
  mgr.request();
  mgr.request();
  assert.equal(timers.cleared, 2);
  await timers.fire();
  assert.equal(calls(), 1);
});

test('status goes syncing then idle with pending count', async () => {
  const { mgr, statuses } = setup({ getPending: async () => 0 });
  mgr.setEnabled(true);
  await mgr.syncNow();
  assert.deepEqual(statuses.map((s) => s.state), ['syncing', 'idle']);
  assert.ok(statuses.at(-1).lastSyncAt > 0);
});

test('a request during a running sync does not overlap and triggers one more run', async () => {
  let running = 0;
  let maxRunning = 0;
  let runs = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const { mgr } = setup({
    sync: async () => {
      running++; maxRunning = Math.max(maxRunning, running); runs++;
      if (runs === 1) await gate;
      running--;
    },
  });
  mgr.setEnabled(true);
  const first = mgr.syncNow();
  const second = mgr.syncNow();
  release();
  await Promise.all([first, second]);
  assert.equal(maxRunning, 1);
  assert.equal(runs, 2);
});

test('an error sets the error state and the next success clears it', async () => {
  let fail = true;
  const { mgr, statuses } = setup({ sync: async () => { if (fail) throw new Error('falhou'); } });
  mgr.setEnabled(true);
  await mgr.syncNow();
  assert.equal(statuses.at(-1).state, 'error');
  assert.match(statuses.at(-1).error, /falhou/);
  fail = false;
  await mgr.syncNow();
  assert.equal(statuses.at(-1).state, 'idle');
});

test('offline reports pending changes without calling sync', async () => {
  const { mgr, statuses, calls } = setup({ isOnline: () => false, getPending: async () => 3 });
  mgr.setEnabled(true);
  await mgr.syncNow();
  assert.equal(calls(), 0);
  assert.deepEqual([statuses.at(-1).state, statuses.at(-1).pending], ['offline', 3]);
});

test('a network error while offline is reported as offline, not error', async () => {
  let online = true;
  const { mgr, statuses } = setup({ isOnline: () => online, sync: async () => { online = false; throw new Error('Failed to fetch'); } });
  mgr.setEnabled(true);
  await mgr.syncNow();
  assert.equal(statuses.at(-1).state, 'offline');
});

test('disabling cancels the pending timer and reports local mode', async () => {
  const { mgr, timers, statuses } = setup();
  mgr.setEnabled(true);
  mgr.request();
  mgr.setEnabled(false);
  assert.equal(timers.fn, null);
  assert.equal(statuses.at(-1).state, 'local');
});
