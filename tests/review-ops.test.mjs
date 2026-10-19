import test from 'node:test';
import assert from 'node:assert/strict';
import { addOption, mergeWithPrevious, removeOption, splitAfterOption } from '../src/review-ops.js';

const mk = (id, keys, answer, text = 'T') => ({
  id, text, images: [], answer,
  options: keys.map((k) => ({ key: k, text: `opt ${k}` })),
});

test('addOption keeps a known answer that is not among the detected options', () => {
  const q = mk('q1', ['A', 'B', 'C', 'D'], 'E');
  addOption(q);
  assert.equal(q.options[4].key, 'E');
  assert.equal(q.answer, 'E');
});

test('addOption keeps an in-range answer', () => {
  const q = mk('q1', ['A', 'B'], 'B');
  addOption(q);
  assert.equal(q.answer, 'B');
});

test('mergeWithPrevious keeps previous answer when previous had no options', () => {
  const qs = [mk('q1', [], 'C', 'enunciado'), mk('q2', ['A', 'B', 'C'], null, 'resto')];
  mergeWithPrevious(qs, 1);
  assert.equal(qs.length, 1);
  assert.equal(qs[0].text, 'enunciado resto');
  assert.equal(qs[0].answer, 'C');
  assert.deepEqual(qs[0].options.map((o) => o.key), ['A', 'B', 'C']);
});

test('removeOption remaps answer', () => {
  const q = mk('q1', ['A', 'B', 'C'], 'C');
  removeOption(q, 0);
  assert.equal(q.answer, 'B');
  removeOption(q, 0);
  removeOption(q, 0);
  assert.equal(q.answer, null);
});

test('splitAfterOption moves trailing options and their answer', () => {
  const qs = [mk('q1', ['A', 'B', 'C', 'D'], 'D')];
  splitAfterOption(qs, 0, 1);
  assert.equal(qs.length, 2);
  assert.deepEqual(qs[0].options.map((o) => o.key), ['A', 'B']);
  assert.equal(qs[0].answer, null);
  assert.deepEqual(qs[1].options.map((o) => o.key), ['A', 'B']);
  assert.equal(qs[1].answer, 'B');
});
