import test from 'node:test';
import assert from 'node:assert/strict';
import { joinItems } from '../src/text-join.js';

const it = (str, x, width, size = 10) => ({ str, x, width, size });

test('items that touch are joined without a space', () => {
  assert.equal(joinItems([it('Nef', 0, 20), it('rologia', 20.4, 35)]), 'Nefrologia');
});

test('a real gap becomes a single space', () => {
  assert.equal(joinItems([it('Questão', 0, 35), it('1', 38.5, 5)]), 'Questão 1');
});

test('overlapping items are joined', () => {
  assert.equal(joinItems([it('po', 0, 12), it('ssui', 11.5, 22)]), 'possui');
});

test('existing spaces in the strings are kept once', () => {
  assert.equal(joinItems([it('Hello ', 0, 30), it('world', 31, 25)]), 'Hello world');
  assert.equal(joinItems([it('Hello', 0, 25), it(' world', 25, 30)]), 'Hello world');
});

test('items are ordered by x before joining', () => {
  assert.equal(joinItems([it('B', 40, 6), it('A', 0, 6)]), 'A B');
});

test('the gap threshold scales with the font size', () => {
  assert.equal(joinItems([it('a', 0, 10, 20), it('b', 12.5, 10, 20)]), 'ab');
  assert.equal(joinItems([it('a', 0, 10, 20), it('b', 14, 10, 20)]), 'a b');
});
