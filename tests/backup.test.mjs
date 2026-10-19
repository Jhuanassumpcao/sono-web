import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import * as s from '../src/storage.js';
import { exportBackup, importBackup } from '../src/backup.js';

const q = [{ id: 'q1', text: 'T', images: ['b1'], options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], answer: 'A' }];

test('export then import restores exams and blobs', async () => {
  s.closeDb();
  await s.openDb('backup-1');
  const f = await s.createFolder('F', null);
  const e = await s.saveExam({ folderId: f.id, title: 'E', questions: q }, { b1: new Blob(['img']) });
  const zip = await exportBackup(JSZip);
  await s.deleteFolder(f.id);
  const counts = await importBackup(zip, JSZip);
  assert.deepEqual(counts, { folders: 1, exams: 1 });
  assert.equal((await s.getExam(e.id)).title, 'E');
  assert.equal(await (await s.getBlob('b1')).text(), 'img');
});

test('import rejects zip without data.json', async () => {
  s.closeDb();
  await s.openDb('backup-2');
  const z = new JSZip();
  z.file('other.txt', 'x');
  const blob = await z.generateAsync({ type: 'blob' });
  await assert.rejects(() => importBackup(blob, JSZip), /backup/i);
});

test('import rejects non-zip input', async () => {
  s.closeDb();
  await s.openDb('backup-3');
  await assert.rejects(() => importBackup(new Blob(['not a zip']), JSZip), /backup/i);
});
