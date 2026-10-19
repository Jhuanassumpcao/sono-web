import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../src/storage.js';

let n = 0;
beforeEach(async () => {
  s.closeDb();
  await s.openDb(`test-${++n}`);
});

const questions = (imgs = []) => [
  { id: 'q1', text: 'T', images: imgs, options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], answer: 'A' },
];

test('folder tree create/rename/move', async () => {
  const a = await s.createFolder('Anatomia', null);
  const h = await s.createFolder('Cabeça', a.id);
  await s.renameFolder(h.id, 'Crânio');
  const b = await s.createFolder('Fisiologia', null);
  await s.moveFolder(h.id, b.id);
  const all = await s.listFolders();
  const moved = all.find((f) => f.id === h.id);
  assert.equal(moved.name, 'Crânio');
  assert.equal(moved.parentId, b.id);
  assert.equal(all.length, 3);
});

test('saveExam then getExam round trip', async () => {
  const f = await s.createFolder('F', null);
  const exam = await s.saveExam({ folderId: f.id, title: 'Simulado 1', questions: questions() }, {});
  const got = await s.getExam(exam.id);
  assert.equal(got.title, 'Simulado 1');
  assert.equal(got.questions[0].answer, 'A');
  assert.equal((await s.listExams(f.id)).length, 1);
});

test('exam blobs round trip', async () => {
  const f = await s.createFolder('F', null);
  const id = await s.putBlob(new Blob(['hello']));
  const blob = await s.getBlob(id);
  assert.equal(await blob.text(), 'hello');
  const exam = await s.saveExam({ folderId: f.id, title: 'X', questions: questions(['b1']) }, { b1: new Blob(['img']) });
  assert.equal(await (await s.getBlob('b1')).text(), 'img');
  assert.ok(exam.id);
});

test('moveExam, renameExam and deleteExam', async () => {
  const a = await s.createFolder('A', null);
  const b = await s.createFolder('B', null);
  const e = await s.saveExam({ folderId: a.id, title: 'old', questions: questions() }, {});
  await s.renameExam(e.id, 'new');
  await s.moveExam(e.id, b.id);
  assert.equal((await s.getExam(e.id)).title, 'new');
  assert.equal((await s.listExams(b.id)).length, 1);
  await s.deleteExam(e.id);
  assert.equal(await s.getExam(e.id), undefined);
});

test('deleteFolder cascades exams, blobs and attempts, leaving no orphans', async () => {
  const a = await s.createFolder('A', null);
  const sub = await s.createFolder('Sub', a.id);
  const e = await s.saveExam({ folderId: sub.id, title: 'E', questions: questions(['b1']) }, { b1: new Blob(['x']) });
  await s.saveAttempt({ examId: e.id, answers: {}, score: 0, total: 1, startedAt: 1, finishedAt: 2 });
  const keep = await s.createFolder('Keep', null);
  await s.deleteFolder(a.id);
  const all = await s.exportAll();
  assert.deepEqual(all.folders.map((f) => f.id), [keep.id]);
  assert.equal(all.exams.length, 0);
  assert.equal(all.attempts.length, 0);
  assert.deepEqual(Object.keys(all.blobs), []);
});

test('listAttempts newest first', async () => {
  const f = await s.createFolder('F', null);
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: questions() }, {});
  await s.saveAttempt({ examId: e.id, answers: {}, score: 0, total: 1, startedAt: 1, finishedAt: 10 });
  await s.saveAttempt({ examId: e.id, answers: {}, score: 1, total: 1, startedAt: 20, finishedAt: 30 });
  const list = await s.listAttempts(e.id);
  assert.deepEqual(list.map((a) => a.finishedAt), [30, 10]);
});

test('exportAll then importAll restores state', async () => {
  const f = await s.createFolder('F', null);
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: questions(['b1']) }, { b1: new Blob(['x']) });
  const dump = await s.exportAll();
  await s.deleteFolder(f.id);
  await s.importAll(dump);
  assert.equal((await s.getExam(e.id)).title, 'E');
  assert.equal(await (await s.getBlob('b1')).text(), 'x');
  assert.equal((await s.listFolders()).length, 1);
});

test('listAllExams and listAllAttempts return everything regardless of folder', async () => {
  const a = await s.createFolder('A', null);
  const e1 = await s.saveExam({ folderId: a.id, title: 'E1', questions: questions() }, {});
  const e2 = await s.saveExam({ folderId: null, title: 'E2', questions: questions() }, {});
  await s.saveAttempt({ examId: e1.id, answers: {}, score: 0, total: 1, startedAt: 1, finishedAt: 2 });
  await s.saveAttempt({ examId: e2.id, answers: {}, score: 1, total: 1, startedAt: 3, finishedAt: 4 });
  assert.deepEqual((await s.listAllExams()).map((e) => e.title).sort(), ['E1', 'E2']);
  assert.equal((await s.listAllAttempts()).length, 2);
});

// ---- Tarefa 2: registros versionados, exclusão lógica, outbox e migração v1 -> v2 ----

test('writes stamp updatedAt and renaming bumps it monotonically', async () => {
  const f = await s.createFolder('A', null);
  const first = await s.getRecord('folders', f.id);
  assert.ok(first.updatedAt > 0);
  await s.renameFolder(f.id, 'B');
  const second = await s.getRecord('folders', f.id);
  assert.ok(second.updatedAt > first.updatedAt);
});

test('every write enqueues an outbox entry with store and id', async () => {
  const f = await s.createFolder('A', null);
  await s.renameFolder(f.id, 'B');
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: questions() }, {});
  const outbox = await s.getOutbox();
  assert.deepEqual(outbox.map((o) => [o.store, o.id]), [['folders', f.id], ['folders', f.id], ['exams', e.id]]);
  assert.ok(outbox[0].seq < outbox[1].seq);
});

test('clearOutbox removes entries up to a sequence number only', async () => {
  await s.createFolder('A', null);
  await s.createFolder('B', null);
  const [first, second] = await s.getOutbox();
  await s.clearOutbox(first.seq);
  assert.deepEqual((await s.getOutbox()).map((o) => o.seq), [second.seq]);
});

test('deleteExam leaves a hidden tombstone and tombstones its attempts', async () => {
  const f = await s.createFolder('F', null);
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: questions(['b1']) }, { b1: new Blob(['x']) });
  const a = await s.saveAttempt({ examId: e.id, answers: {}, score: 0, total: 1, startedAt: 1, finishedAt: 2 });
  await s.deleteExam(e.id);
  assert.equal(await s.getExam(e.id), undefined);
  assert.equal((await s.listExams(f.id)).length, 0);
  assert.equal((await s.listAllExams()).length, 0);
  assert.equal((await s.listAttempts(e.id)).length, 0);
  assert.equal(await s.getAttempt(a.id), undefined);
  assert.equal((await s.getRecord('exams', e.id)).deleted, true);
  assert.equal((await s.getRecord('attempts', a.id)).deleted, true);
  assert.equal(await s.getBlob('b1'), undefined);
  const outbox = await s.getOutbox();
  assert.ok(outbox.some((o) => o.store === 'exams' && o.id === e.id));
  assert.ok(outbox.some((o) => o.store === 'attempts' && o.id === a.id));
});

test('deleteFolder tombstones folder, subfolders and exams', async () => {
  const a = await s.createFolder('A', null);
  const sub = await s.createFolder('Sub', a.id);
  const e = await s.saveExam({ folderId: sub.id, title: 'E', questions: questions() }, {});
  await s.deleteFolder(a.id);
  assert.deepEqual(await s.listFolders(), []);
  for (const [store, id] of [['folders', a.id], ['folders', sub.id], ['exams', e.id]]) {
    assert.equal((await s.getRecord(store, id)).deleted, true, `${store}/${id}`);
  }
});

test('applyRemote stores a record without enqueueing it', async () => {
  await s.applyRemote('folders', { id: 'r1', parentId: null, name: 'Remota', updatedAt: 5 });
  assert.equal((await s.listFolders())[0].name, 'Remota');
  assert.deepEqual(await s.getOutbox(), []);
});

test('meta values round trip', async () => {
  assert.equal(await s.getMeta('cursor:exams'), undefined);
  await s.setMeta('cursor:exams', 42);
  assert.equal(await s.getMeta('cursor:exams'), 42);
});

test('importAll tombstones existing records missing from the backup so the deletion syncs', async () => {
  const keep = await s.createFolder('Keep', null);
  const gone = await s.createFolder('Gone', null);
  const dump = { folders: [{ id: keep.id, parentId: null, name: 'Keep' }], exams: [], attempts: [], blobs: {} };
  await s.importAll(dump);
  assert.deepEqual((await s.listFolders()).map((f) => f.id), [keep.id]);
  assert.equal((await s.getRecord('folders', gone.id)).deleted, true);
});

test('opening a v1 database migrates records to v2 keeping data and adding updatedAt', async () => {
  s.closeDb();
  const name = `legacy-${++n}`;
  await new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      for (const st of ['folders', 'exams', 'blobs', 'attempts']) req.result.createObjectStore(st, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['folders', 'exams', 'attempts'], 'readwrite');
      tx.objectStore('folders').put({ id: 'f1', parentId: null, name: 'Antiga' });
      tx.objectStore('exams').put({ id: 'e1', folderId: 'f1', title: 'T', createdAt: 1000, questions: questions() });
      tx.objectStore('attempts').put({ id: 'a1', examId: 'e1', answers: {}, score: 1, total: 1, startedAt: 1, finishedAt: 2000 });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    req.onerror = () => reject(req.error);
  });
  await s.openDb(name);
  assert.equal((await s.listFolders())[0].name, 'Antiga');
  assert.equal((await s.getRecord('exams', 'e1')).updatedAt, 1000);
  assert.equal((await s.getRecord('attempts', 'a1')).updatedAt, 2000);
  assert.ok((await s.getRecord('folders', 'f1')).updatedAt > 0);
  assert.deepEqual(await s.getOutbox(), []);
});

// ---- helpers para sincronização na nuvem ----

test('onChange fires after each write and can be unsubscribed', async () => {
  let calls = 0;
  const off = s.onChange(() => { calls++; });
  await s.createFolder('A', null);
  assert.equal(calls, 1);
  off();
  await s.createFolder('B', null);
  assert.equal(calls, 1);
});

test('putBlobWithId stores a blob under a given id', async () => {
  await s.putBlobWithId('img-9', new Blob(['abc']));
  assert.equal(await (await s.getBlob('img-9')).text(), 'abc');
});

test('enqueueAll queues every record, tombstones included, without changing updatedAt', async () => {
  const a = await s.createFolder('A', null);
  const b = await s.createFolder('B', null);
  await s.deleteFolder(b.id);
  const before = (await s.getRecord('folders', a.id)).updatedAt;
  await s.clearOutbox(Infinity);
  await s.enqueueAll();
  const queued = (await s.getOutbox()).map((o) => o.id).sort();
  assert.deepEqual(queued, [a.id, b.id].sort());
  assert.equal((await s.getRecord('folders', a.id)).updatedAt, before);
});

test('countLive counts only non-deleted records', async () => {
  const f = await s.createFolder('F', null);
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: questions() }, {});
  await s.saveAttempt({ examId: e.id, answers: {}, score: 0, total: 1, startedAt: 1, finishedAt: 2 });
  assert.deepEqual(await s.countLive(), { folders: 1, exams: 1, attempts: 1 });
  await s.deleteFolder(f.id);
  assert.deepEqual(await s.countLive(), { folders: 0, exams: 0, attempts: 0 });
});

test('listImageIds returns images referenced by live exams only', async () => {
  const f = await s.createFolder('F', null);
  const keep = await s.saveExam({ folderId: f.id, title: 'K', questions: questions(['k1', 'k2']) }, { k1: new Blob(['1']), k2: new Blob(['2']) });
  const gone = await s.saveExam({ folderId: f.id, title: 'G', questions: questions(['g1']) }, { g1: new Blob(['3']) });
  await s.deleteExam(gone.id);
  assert.deepEqual((await s.listImageIds()).sort(), ['k1', 'k2']);
  assert.ok(keep.id);
});

test('wipeLocal clears records, blobs, outbox and meta', async () => {
  const f = await s.createFolder('F', null);
  await s.saveExam({ folderId: f.id, title: 'E', questions: questions(['b1']) }, { b1: new Blob(['x']) });
  await s.setMeta('userId', 'u1');
  await s.wipeLocal();
  assert.deepEqual(await s.countLive(), { folders: 0, exams: 0, attempts: 0 });
  assert.equal(await s.getBlob('b1'), undefined);
  assert.deepEqual(await s.getOutbox(), []);
  assert.equal(await s.getMeta('userId'), undefined);
});

test('images inside options count as exam images (listing and deletion)', async () => {
  const f = await s.createFolder('F', null);
  const qs = [{
    id: 'q1', text: 'T', images: ['stmt'], answer: 'A',
    options: [{ key: 'A', text: '', image: 'oa' }, { key: 'B', text: '', image: 'ob' }],
  }];
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: qs }, {
    stmt: new Blob(['s']), oa: new Blob(['a']), ob: new Blob(['b']),
  });
  assert.deepEqual((await s.listImageIds()).sort(), ['oa', 'ob', 'stmt']);
  await s.deleteExam(e.id);
  for (const id of ['stmt', 'oa', 'ob']) assert.equal(await s.getBlob(id), undefined, id);
});
