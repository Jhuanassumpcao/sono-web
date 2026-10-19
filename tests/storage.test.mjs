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
