import test from 'node:test';
import assert from 'node:assert/strict';
import { detect } from '../src/detector.js';

const L = (texts, page = 1, y0 = 10) =>
  texts.map((text, i) => ({ text, page, y: y0 + i * 12 }));

const basic = [
  '1. Qual osso forma a fronte?',
  'A) Frontal',
  'B) Parietal',
  'C) Occipital',
  '2) Qual osso é o maior do crânio?',
  'A) Mandíbula',
  'B) Esfenoide',
];

test('detects numbered questions with A) options', () => {
  const r = detect(L([...basic, 'Gabarito: 1-A 2-A']), []);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].id, 'q1');
  assert.equal(r.questions[0].text, 'Qual osso forma a fronte?');
  assert.deepEqual(r.questions[0].options.map((o) => o.key), ['A', 'B', 'C']);
  assert.equal(r.questions[1].options[1].text, 'Esfenoide');
});

test('joins multi-line option text and statement text', () => {
  const r = detect(L([
    '1. Considere o texto',
    'que continua aqui.',
    'A) Primeira opção',
    'que continua na linha seguinte',
    'B) Segunda',
  ]), []);
  assert.equal(r.questions[0].text, 'Considere o texto que continua aqui.');
  assert.equal(r.questions[0].options.length, 2);
  assert.equal(r.questions[0].options[0].text, 'Primeira opção que continua na linha seguinte');
});

test('ignores years and out-of-sequence numbers inside statement as new question', () => {
  const r = detect(L([
    '1. Em 2019 houve um caso.',
    '2019. Considere o relato',
    '12. Considere também',
    'A) x',
    'B) y',
  ]), []);
  assert.equal(r.questions.length, 1);
  assert.match(r.questions[0].text, /Considere também/);
});

test("parses 'Gabarito: 1-C 2-A' inline", () => {
  const r = detect(L([...basic, 'Gabarito: 1-C 2-A']), []);
  assert.equal(r.keyFound, true);
  assert.deepEqual(r.answerKey, { 1: 'C', 2: 'A' });
  assert.equal(r.questions[0].answer, 'C');
});

test('parses answer key one per line, lowercase, spaced', () => {
  const r = detect(L([...basic, 'Gabarito', '1 - c', '2 - b']), []);
  assert.equal(r.questions[0].answer, 'C');
  assert.equal(r.questions[1].answer, 'B');
});

test('parses headerless trailing key block', () => {
  const r = detect(L([...basic, '1-A', '2-B', '3-C']), []);
  assert.equal(r.keyFound, true);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[1].answer, 'B');
});

test('answer for missing question is ignored on questions but kept in key', () => {
  const r = detect(L([...basic, 'Gabarito: 1-A 2-A 9-D']), []);
  assert.equal(r.questions.length, 2);
  assert.equal(r.answerKey[9], 'D');
});

test('question without key has answer null and keyFound false', () => {
  const r = detect(L(basic), []);
  assert.equal(r.keyFound, false);
  assert.equal(r.questions[0].answer, null);
});

test('attaches image to the question containing its y', () => {
  const lines = [
    { text: '1. Veja a figura', page: 1, y: 10 },
    { text: 'A) a', page: 1, y: 20 },
    { text: 'B) b', page: 1, y: 30 },
    { text: '2. Outra', page: 1, y: 200 },
    { text: 'A) a', page: 1, y: 210 },
    { text: 'B) b', page: 1, y: 220 },
  ];
  const r = detect(lines, [{ blobId: 'img1', page: 1, y: 50 }, { blobId: 'img2', page: 1, y: 205 }]);
  assert.deepEqual(r.questions[0].images, ['img1']);
  assert.deepEqual(r.questions[1].images, ['img2']);
});

test('image before first question goes to the first', () => {
  const r = detect(L(basic, 1, 100), [{ blobId: 'top', page: 1, y: 5 }]);
  assert.deepEqual(r.questions[0].images, ['top']);
});

test('single page single question', () => {
  const r = detect(L(['1. Pergunta única?', 'A) sim', 'B) não', 'Gabarito: 1-B']), []);
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].answer, 'B');
});

test('statement starting with a letter after a dot is not an option unless sequential from A', () => {
  const r = detect(L(['1. Pergunta', 'C. elegans é um verme.', 'A) x', 'B) y']), []);
  assert.equal(r.questions[0].options.length, 2);
  assert.match(r.questions[0].text, /C\. elegans/);
});

test('"Questão 1" heading without separator starts a question', () => {
  const r = detect(L(['Questão 1', 'Quanto é 1+1?', 'A) 1', 'B) 2', 'QUESTÃO 02', 'Outra?', 'A) x', 'B) y']), []);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].text, 'Quanto é 1+1?');
});

test('numbering may start at the first number in the answer key', () => {
  const r = detect(L(['46. Pergunta?', 'A) x', 'B) y', '47. Outra?', 'A) x', 'B) y', 'Gabarito: 46-A 47-B']), []);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].id, 'q46');
  assert.equal(r.questions[1].answer, 'B');
});

test('thousands separator at line start is not a new question', () => {
  const r = detect(L(['1. Uma empresa tinha', '2.500 funcionários em 2019.', 'A) x', 'B) y', '2. Segunda', 'A) x', 'B) y']), []);
  assert.equal(r.questions.length, 2);
  assert.match(r.questions[0].text, /2\.500 funcionários/);
  assert.equal(r.questions[0].options.length, 2);
});

test('statement line starting with "resposta" does not cut the exam or become the key', () => {
  const r = detect(L(['1. Pergunta', 'resposta correta sobre 2 e 3.', 'A) x', 'B) y', '2. Outra', 'A) x', 'B) y']), []);
  assert.equal(r.questions.length, 2);
  assert.equal(r.keyFound, false);
  const r2 = detect(L(['Respostas devem ser marcadas a caneta.', '1. P', 'A) x', 'B) y']), []);
  assert.equal(r2.questions.length, 1);
});

test('lowercase letters in plain words are not key letters', () => {
  const r = detect(L([...basic, 'Gabarito', 'veja 1 e 2 acima']), []);
  assert.equal(r.keyFound, false);
});

test('table-format answer key maps numbers row to letters row', () => {
  const r = detect(L([...basic, 'Gabarito', '1 2', 'B A']), []);
  assert.deepEqual(r.answerKey, { 1: 'B', 2: 'A' });
  assert.equal(r.questions[1].answer, 'A');
});
