import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/validator.js';

const q = (over = {}) => ({
  id: 'q1', text: 'Pergunta?', images: [],
  options: [{ key: 'A', text: 'x' }, { key: 'B', text: 'y' }], answer: 'A', ...over,
});
const codes = (r) => r.issues.map((i) => i.code);

test('valid exam -> ok true, issues []', () => {
  const r = validate([q()], true);
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues, []);
});

test('NO_QUESTIONS is an error', () => {
  const r = validate([], false);
  assert.deepEqual(codes(r), ['NO_QUESTIONS']);
  assert.equal(r.ok, false);
});

test('EMPTY_TEXT is an error', () => {
  assert.ok(codes(validate([q({ text: '  ' })], true)).includes('EMPTY_TEXT'));
});

test('FEW_OPTIONS when fewer than 2 options', () => {
  const r = validate([q({ options: [{ key: 'A', text: 'x' }], answer: null })], true);
  assert.ok(codes(r).includes('FEW_OPTIONS'));
  assert.equal(r.ok, false);
});

test('NO_ANSWER is a warning and does not block ok', () => {
  const r = validate([q({ answer: null })], false);
  assert.deepEqual(codes(r), ['NO_ANSWER']);
  assert.equal(r.issues[0].level, 'warning');
  assert.equal(r.ok, true);
});

test('ANSWER_NOT_IN_OPTIONS is an error', () => {
  const r = validate([q({ answer: 'E' })], true);
  assert.ok(codes(r).includes('ANSWER_NOT_IN_OPTIONS'));
  assert.equal(r.ok, false);
});

test('DUPLICATE_KEY is an error', () => {
  const r = validate([q({ options: [{ key: 'A', text: 'x' }, { key: 'A', text: 'y' }] })], true);
  assert.ok(codes(r).includes('DUPLICATE_KEY'));
});

test('summary lists counts', () => {
  const qs = [
    q({ id: 'q1', answer: null }),
    q({ id: 'q2', answer: null }),
    q({ id: 'q3', options: [{ key: 'A', text: 'x' }], answer: null }),
    q({ id: 'q4' }),
  ];
  assert.equal(
    validate(qs, true).summary,
    '4 questões detectadas, 3 sem gabarito, 1 com menos de 2 alternativas'
  );
});

test('issues carry questionId', () => {
  const r = validate([q({ id: 'q7', answer: null })], false);
  assert.equal(r.issues[0].questionId, 'q7');
});
