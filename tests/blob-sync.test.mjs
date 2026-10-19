import 'fake-indexeddb/auto';
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as storage from '../src/storage.js';
import { createBlobSync } from '../src/blob-sync.js';
import { fitWithin } from '../src/image-compress.js';

let n = 0;
beforeEach(async () => {
  storage.closeDb();
  await storage.openDb(`blobs-${++n}`);
});

const questions = (imgs) => [
  { id: 'q1', text: 'T', images: imgs, options: [{ key: 'A', text: 'a' }, { key: 'B', text: 'b' }], answer: 'A' },
];

/** Bucket falso do Storage. */
function fakeBucket() {
  const files = new Map();
  return {
    files, uploads: [], downloads: [], failUpload: new Set(),
    async upload(path, blob, opts) {
      this.uploads.push({ path, opts });
      if ([...this.failUpload].some((id) => path.endsWith(id))) return { error: { message: 'too large' } };
      files.set(path, blob);
      return { error: null };
    },
    async download(path) {
      this.downloads.push(path);
      return files.has(path) ? { data: files.get(path), error: null } : { data: null, error: { message: 'not found' } };
    },
  };
}

const compress = async (blob) => new Blob([`c:${await blob.text()}`], { type: 'image/webp' });

async function seed(images) {
  const f = await storage.createFolder('F', null);
  const blobs = Object.fromEntries(images.map((id) => [id, new Blob([id])]));
  return storage.saveExam({ folderId: f.id, title: 'E', questions: questions(images) }, blobs);
}

test('uploads each referenced image once, compressed, under <userId>/<blobId>', async () => {
  await seed(['i1', 'i2']);
  const bucket = fakeBucket();
  const bs = createBlobSync({ storage, bucket, userId: 'u1', compress });
  const r = await bs.uploadPending();
  assert.deepEqual(r, { uploaded: 2, failed: 0 });
  assert.deepEqual(bucket.uploads.map((u) => u.path).sort(), ['u1/i1', 'u1/i2']);
  assert.equal(bucket.uploads[0].opts.upsert, true);
  assert.equal(bucket.uploads[0].opts.contentType, 'image/webp');
  assert.equal(await bucket.files.get('u1/i1').text(), 'c:i1');
  assert.deepEqual(await bs.uploadPending(), { uploaded: 0, failed: 0 });
  assert.equal(bucket.uploads.length, 2);
});

test('does not upload images that belong only to deleted exams', async () => {
  const e = await seed(['gone']);
  await storage.deleteExam(e.id);
  const bucket = fakeBucket();
  const r = await createBlobSync({ storage, bucket, userId: 'u1', compress }).uploadPending();
  assert.deepEqual(r, { uploaded: 0, failed: 0 });
});

test('skips images that are not on this device yet', async () => {
  const f = await storage.createFolder('F', null);
  await storage.saveExam({ folderId: f.id, title: 'E', questions: questions(['remote-only']) }, {});
  const bucket = fakeBucket();
  const r = await createBlobSync({ storage, bucket, userId: 'u1', compress }).uploadPending();
  assert.deepEqual(r, { uploaded: 0, failed: 0 });
  assert.equal(bucket.uploads.length, 0);
});

test('a failing upload is counted, others proceed, and it is retried next time', async () => {
  await seed(['ok', 'bad']);
  const bucket = fakeBucket();
  bucket.failUpload.add('bad');
  const bs = createBlobSync({ storage, bucket, userId: 'u1', compress });
  assert.deepEqual(await bs.uploadPending(), { uploaded: 1, failed: 1 });
  bucket.failUpload.clear();
  assert.deepEqual(await bs.uploadPending(), { uploaded: 1, failed: 0 });
});

test('ensureBlob returns the local blob without downloading', async () => {
  await seed(['i1']);
  const bucket = fakeBucket();
  const blob = await createBlobSync({ storage, bucket, userId: 'u1', compress }).ensureBlob('i1');
  assert.equal(await blob.text(), 'i1');
  assert.equal(bucket.downloads.length, 0);
});

test('ensureBlob downloads a missing image once, stores it locally and marks it as already in the cloud', async () => {
  const bucket = fakeBucket();
  bucket.files.set('u1/r1', new Blob(['remote-bytes']));
  const bs = createBlobSync({ storage, bucket, userId: 'u1', compress });
  const [a, b] = await Promise.all([bs.ensureBlob('r1'), bs.ensureBlob('r1')]);
  assert.equal(await a.text(), 'remote-bytes');
  assert.equal(await b.text(), 'remote-bytes');
  assert.equal(bucket.downloads.length, 1);
  assert.equal(await (await storage.getBlob('r1')).text(), 'remote-bytes');
  const f = await storage.createFolder('F', null);
  await storage.saveExam({ folderId: f.id, title: 'E', questions: questions(['r1']) }, {});
  assert.deepEqual(await bs.uploadPending(), { uploaded: 0, failed: 0 });
});

test('ensureBlob returns undefined when the image is not in the cloud either', async () => {
  const bs = createBlobSync({ storage, bucket: fakeBucket(), userId: 'u1', compress });
  assert.equal(await bs.ensureBlob('nope'), undefined);
});

test('fitWithin scales down keeping the aspect ratio and never scales up', () => {
  assert.deepEqual(fitWithin(3200, 1600, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitWithin(1000, 4000, 1600), { width: 400, height: 1600 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
});
