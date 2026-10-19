import test from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../src/scoring.js';

const qs = [
  { id: 'q1', answer: 'A' },
  { id: 'q2', answer: 'B' },
];

test('all correct -> percent 100', () => {
  const r = score(qs, { q1: 'A', q2: 'B' });
  assert.equal(r.correct, 2);
  assert.equal(r.total, 2);
  assert.equal(r.percent, 100);
});

test('unanswered counts as wrong, chosen null', () => {
  const r = score(qs, { q1: 'A' });
  assert.equal(r.correct, 1);
  assert.deepEqual(r.perQuestion[1], { questionId: 'q2', chosen: null, correct: false });
});

test('zero questions -> percent 0 (no NaN)', () => {
  const r = score([], {});
  assert.equal(r.percent, 0);
  assert.equal(r.total, 0);
});

test('answer null in question is never correct', () => {
  const r = score([{ id: 'q1', answer: null }], { q1: 'A' });
  assert.equal(r.correct, 0);
});

test('percent rounded to one decimal', () => {
  const r = score([{ id: 'a', answer: 'A' }, { id: 'b', answer: 'A' }, { id: 'c', answer: 'A' }], { a: 'A' });
  assert.equal(r.percent, 33.3);
});
