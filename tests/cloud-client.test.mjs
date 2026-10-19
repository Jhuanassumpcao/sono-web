import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudClient, toRow, fromRow, PULL_OVERLAP } from '../src/cloud-client.js';

/** Supabase falso: guarda linhas por tabela e implementa só o que o cliente usa. */
function fakeSb(data = {}) {
  const calls = [];
  return {
    calls, data,
    from(table) {
      const q = {
        filters: [], rangeArgs: null,
        select() { return q; },
        gt(col, val) { q.filters.push([col, val]); return q; },
        order() { return q; },
        range(a, b) { q.rangeArgs = [a, b]; return q; },
        upsert(rows, opts) { calls.push({ table, rows, opts }); return Promise.resolve({ error: data.pushError ?? null }); },
        then(resolve, reject) {
          let rows = [...(data[table] ?? [])];
          for (const [col, val] of q.filters) rows = rows.filter((r) => r[col] > val);
          rows.sort((a, b) => a.synced_at - b.synced_at);
          if (q.rangeArgs) rows = rows.slice(q.rangeArgs[0], q.rangeArgs[1] + 1);
          calls.push({ table, select: true, filters: q.filters, range: q.rangeArgs });
          return Promise.resolve({ data: rows, error: data.pullError ?? null }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

test('toRow and fromRow map folders', () => {
  const rec = { id: 'f1', parentId: 'p1', name: 'A', updatedAt: 5 };
  const row = toRow('folders', rec, 'u1');
  assert.deepEqual(row, { user_id: 'u1', id: 'f1', parent_id: 'p1', name: 'A', updated_at: 5, deleted: false });
  assert.deepEqual(fromRow('folders', { ...row, synced_at: 99 }), rec);
});

test('toRow and fromRow map exams', () => {
  const rec = { id: 'e1', folderId: null, title: 'T', createdAt: 1, questions: [{ id: 'q1' }], updatedAt: 7 };
  const row = toRow('exams', rec, 'u1');
  assert.equal(row.folder_id, null);
  assert.equal(row.created_at, 1);
  assert.deepEqual(fromRow('exams', { ...row, synced_at: 1 }), rec);
});

test('toRow and fromRow map attempts, keeping questionIds optional', () => {
  const rec = { id: 'a1', examId: 'e1', questionIds: ['q1'], answers: { q1: 'A' }, score: 1, total: 2, startedAt: 1, finishedAt: 2, updatedAt: 3 };
  assert.deepEqual(fromRow('attempts', { ...toRow('attempts', rec, 'u1'), synced_at: 1 }), rec);
  const noIds = { ...rec };
  delete noIds.questionIds;
  const back = fromRow('attempts', { ...toRow('attempts', noIds, 'u1'), synced_at: 1 });
  assert.equal(back.questionIds, undefined);
});

test('deleted is exposed only for tombstones', () => {
  const live = fromRow('folders', { user_id: 'u', id: 'f', parent_id: null, name: 'x', updated_at: 1, deleted: false, synced_at: 1 });
  assert.equal('deleted' in live, false);
  const dead = fromRow('folders', { user_id: 'u', id: 'f', parent_id: null, name: 'x', updated_at: 1, deleted: true, synced_at: 1 });
  assert.equal(dead.deleted, true);
  assert.equal(toRow('folders', { id: 'f', parentId: null, name: 'x', updatedAt: 1, deleted: true }, 'u').deleted, true);
});

test('push upserts mapped rows on (user_id, id)', async () => {
  const sb = fakeSb();
  const client = createCloudClient({ sb, userId: 'u1' });
  await client.push('folders', [{ id: 'f1', parentId: null, name: 'A', updatedAt: 1 }]);
  assert.equal(sb.calls[0].table, 'folders');
  assert.deepEqual(sb.calls[0].opts, { onConflict: 'user_id,id' });
  assert.equal(sb.calls[0].rows[0].user_id, 'u1');
});

test('push throws when the server answers with an error', async () => {
  const sb = fakeSb({ pushError: { message: 'RLS violation' } });
  const client = createCloudClient({ sb, userId: 'u1' });
  await assert.rejects(() => client.push('folders', [{ id: 'f', parentId: null, name: 'x', updatedAt: 1 }]), /RLS violation/);
});

test('pull maps rows and returns the max synced_at as the next cursor', async () => {
  const sb = fakeSb({ folders: [
    { user_id: 'u', id: 'a', parent_id: null, name: 'A', updated_at: 1, deleted: false, synced_at: 100_000_000 },
    { user_id: 'u', id: 'b', parent_id: null, name: 'B', updated_at: 2, deleted: false, synced_at: 200_000_000 },
  ] });
  const r = await createCloudClient({ sb, userId: 'u' }).pull('folders', undefined);
  assert.deepEqual(r.rows.map((x) => x.id), ['a', 'b']);
  assert.equal(r.cursor, 200_000_000);
});

test('pull re-reads a safety window before the cursor', async () => {
  const sb = fakeSb({ folders: [
    { user_id: 'u', id: 'old', parent_id: null, name: 'O', updated_at: 1, deleted: false, synced_at: 100_000_000 },
    { user_id: 'u', id: 'late', parent_id: null, name: 'L', updated_at: 2, deleted: false, synced_at: 195_000_000 },
  ] });
  const cursor = 200_000_000;
  const r = await createCloudClient({ sb, userId: 'u' }).pull('folders', cursor);
  assert.deepEqual(r.rows.map((x) => x.id), ['late']);
  assert.ok(PULL_OVERLAP >= 5_000_000);
  assert.equal(r.cursor, cursor);
});

test('pull keeps the cursor when there is nothing new', async () => {
  const r = await createCloudClient({ sb: fakeSb({ folders: [] }), userId: 'u' }).pull('folders', 42);
  assert.deepEqual(r, { rows: [], cursor: 42 });
});

test('pull pages through large results', async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ user_id: 'u', id: `r${i}`, parent_id: null, name: `${i}`, updated_at: i, deleted: false, synced_at: 1_000_000 * (i + 1) }));
  const sb = fakeSb({ folders: rows });
  const r = await createCloudClient({ sb, userId: 'u', pageSize: 2 }).pull('folders', undefined);
  assert.equal(r.rows.length, 5);
  assert.equal(sb.calls.filter((c) => c.select).length, 3);
});

test('pull throws on server error', async () => {
  const sb = fakeSb({ pullError: { message: 'JWT expired' } });
  await assert.rejects(() => createCloudClient({ sb, userId: 'u' }).pull('folders', undefined), /JWT expired/);
});
