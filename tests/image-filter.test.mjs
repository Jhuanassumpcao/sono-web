import test from 'node:test';
import assert from 'node:assert/strict';
import { filterDecorative } from '../src/image-filter.js';

const img = (id, page, over = {}) => ({
  blobId: id, page, y: 100, width: 2295, height: 3000,
  drawnW: 120, drawnH: 80, pageW: 595, pageH: 842, ...over,
});

test('image with the same pixel size on at least half of the pages is decorative', () => {
  const images = [];
  for (let p = 1; p <= 8; p++) images.push(img(`w${p}`, p, { drawnW: 100, drawnH: 100 }));
  const r = filterDecorative(images, 8);
  assert.equal(r.kept.length, 0);
  assert.equal(r.dropped.length, 8);
});

test('unique figure is kept alongside a repeated watermark', () => {
  const images = [img('fig', 2, { width: 640, height: 480 })];
  for (let p = 1; p <= 6; p++) images.push(img(`w${p}`, p));
  const r = filterDecorative(images, 6);
  assert.deepEqual(r.kept.map((i) => i.blobId), ['fig']);
});

test('page-sized image is a background and is dropped', () => {
  const r = filterDecorative([img('bg', 1, { drawnW: 590, drawnH: 830 })], 3);
  assert.equal(r.kept.length, 0);
});

test('same logo on both pages of a two-page document is dropped', () => {
  const r = filterDecorative([img('a', 1, { width: 200, height: 60 }), img('b', 2, { width: 200, height: 60 })], 2);
  assert.equal(r.kept.length, 0);
});

test('single image in a single-page document is kept', () => {
  const r = filterDecorative([img('only', 1, { width: 400, height: 300 })], 1);
  assert.equal(r.kept.length, 1);
});

test('same-size figures on a minority of pages are kept', () => {
  const images = [img('a', 1, { width: 400, height: 300 }), img('b', 5, { width: 400, height: 300 })];
  const r = filterDecorative(images, 10);
  assert.equal(r.kept.length, 2);
});
