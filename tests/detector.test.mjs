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

import { cleanLines } from '../src/detector.js';

test('bare options "A texto" without separator are detected', () => {
  const r = detect(L([
    'Questão 1 Tema', 'Qual a conduta?', 'A Tomografia', 'B Ressonância', 'C Biópsia', 'D Nada', 'E N.D.A.',
    'Questão 2 Outro', 'Pergunta?', 'A Sim', 'B Não', 'Respostas:', '1 B 2 A',
  ]), []);
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions[0].options.map((o) => o.key), ['A', 'B', 'C', 'D', 'E']);
  assert.equal(r.questions[0].subtitle, 'Tema');
  assert.equal(r.questions[0].text, 'Qual a conduta?');
  assert.equal(r.questions[0].answer, 'B');
});

test('statement line starting with "A " is not option A when real options follow', () => {
  const r = detect(L([
    '1. Caso', 'A paciente refere dor.', 'Qual o diagnóstico?', 'A Lúpus', 'B Artrite', 'C Gota',
  ]), []);
  assert.equal(r.questions[0].options.length, 3);
  assert.equal(r.questions[0].options[0].text, 'Lúpus');
  assert.match(r.questions[0].text, /A paciente refere dor\./);
});

test('option text starting with a capital letter does not break the sequence', () => {
  const r = detect(L(['1. P?', 'A Sim', 'B Não', 'C A dosagem é alta', 'D N.D.A.']), []);
  assert.deepEqual(r.questions[0].options.map((o) => o.text), ['Sim', 'Não', 'A dosagem é alta', 'N.D.A.']);
});

test('cleanLines repairs fi ligatures extracted as 3 or <', () => {
  const out = cleanLines(L(['intensi3caram e Tomogra<a posi- tivo CD3, CD4 e C5a']));
  assert.equal(out[0].text, 'intensificaram e Tomografia positivo CD3, CD4 e C5a');
});

test('cleanLines drops boilerplate repeated on 3+ pages but keeps options and question headings', () => {
  const lines = [];
  for (let p = 1; p <= 4; p++) {
    lines.push({ text: `Questão ${p} Tema`, page: p, y: 10 });
    lines.push({ text: 'E N.D.A.', page: p, y: 20 });
    lines.push({ text: `Essa questão possui comentário no site 40000${p}`, page: p, y: 30 });
    lines.push({ text: 'proibida venda', page: p, y: 40 });
  }
  const out = cleanLines(lines).map((l) => l.text);
  assert.equal(out.length, 8);
  assert.ok(out.includes('E N.D.A.'));
  assert.ok(!out.some((t) => /proibida|Essa questão/.test(t)));
});

test('cleanLines drops stray numeric codes but keeps answer-key number rows', () => {
  const out = cleanLines(L(['A Texto da opção', '4 0001903 91', 'Gabarito', '1 2 3', 'A B C'])).map((l) => l.text);
  assert.deepEqual(out, ['A Texto da opção', 'Gabarito', '1 2 3', 'A B C']);
});

test('text after "Questão N" is a subtitle when a statement follows', () => {
  const r = detect(L(['Questão 1 Traumatismos Oculares', 'Assinale a incorreta.', 'A x', 'B y']), []);
  assert.equal(r.questions[0].subtitle, 'Traumatismos Oculares');
  assert.equal(r.questions[0].text, 'Assinale a incorreta.');
});

test('single-line "Questão N texto" without further statement keeps the text as statement', () => {
  const r = detect(L(['Questão 1 Qual osso forma a fronte?', 'A Frontal', 'B Parietal']), []);
  assert.equal(r.questions[0].subtitle, '');
  assert.equal(r.questions[0].text, 'Qual osso forma a fronte?');
});

test('numbered "1. texto" keeps the first line as part of the statement and has empty subtitle', () => {
  const r = detect(L(['1. Qual osso?', 'A) x', 'B) y']), []);
  assert.equal(r.questions[0].subtitle, '');
  assert.equal(r.questions[0].text, 'Qual osso?');
});

// ---- alternativas em imagem, ligaduras e espaçamento (PDF "Distúrbios do Potássio") ----

const at = (text, y, page = 1) => ({ text, page, y });

test('lone letters A..D with images beside them become options with an image each', () => {
  const lines = [
    at('Questão 1 Tema', 10), at('Qual o ECG?', 30),
    at('A', 100), at('B', 190), at('C', 280), at('D', 370),
    at('Questão 2 Outro', 500), at('Pergunta?', 520), at('A Sim', 540), at('B Não', 560),
  ];
  const images = [
    { blobId: 'ia', page: 1, y: 85, drawnH: 60 },
    { blobId: 'ib', page: 1, y: 175, drawnH: 60 },
    { blobId: 'ic', page: 1, y: 265, drawnH: 60 },
    { blobId: 'id', page: 1, y: 355, drawnH: 60 },
  ];
  const r = detect(lines, images);
  assert.deepEqual(r.questions[0].options.map((o) => [o.key, o.text, o.image]), [
    ['A', '', 'ia'], ['B', '', 'ib'], ['C', '', 'ic'], ['D', '', 'id'],
  ]);
  assert.deepEqual(r.questions[0].images, []);
  assert.equal(r.questions[1].options.length, 2);
});

test('a statement image above the lone letters stays with the question', () => {
  const lines = [at('Questão 1 Tema', 10), at('Veja o ECG.', 30), at('A', 200), at('B', 290)];
  const images = [
    { blobId: 'stmt', page: 1, y: 40, drawnH: 100 },
    { blobId: 'ia', page: 1, y: 185, drawnH: 60 },
    { blobId: 'ib', page: 1, y: 275, drawnH: 60 },
  ];
  const q = detect(lines, images).questions[0];
  assert.deepEqual(q.images, ['stmt']);
  assert.deepEqual(q.options.map((o) => o.image), ['ia', 'ib']);
});

test('a question with images but no text options gets empty options flagged as in-image', () => {
  const lines = [];
  for (let n = 1; n <= 3; n++) {
    lines.push(at(`Questão ${n} Tema`, n * 100), at('Pergunta?', n * 100 + 10), at('A a', n * 100 + 20), at('B b', n * 100 + 30), at('C c', n * 100 + 40), at('D d', n * 100 + 50));
  }
  lines.push(at('Questão 4 Tema', 400), at('Qual a conduta?', 410));
  const r = detect(lines, [{ blobId: 'fig', page: 1, y: 415, drawnH: 50 }]);
  const q4 = r.questions[3];
  assert.equal(q4.optionsInImage, true);
  assert.deepEqual(q4.options.map((o) => o.key), ['A', 'B', 'C', 'D']);
  assert.ok(q4.options.every((o) => o.text === ''));
  assert.equal(r.questions[0].optionsInImage, undefined);
});

test('a question with no options and no images is left without options', () => {
  const r = detect(L(['Questão 1 Tema', 'Pergunta sem alternativas?']), []);
  assert.equal(r.questions[0].options.length, 0);
  assert.equal(r.questions[0].optionsInImage, undefined);
});

test('cleanLines repairs a 9 ligature inside words, and at word start only when the document proves it', () => {
  const proven = cleanLines(L(['su9ciente', 'gra9co e a9m', 'ca9a', 'conteúdo 9siológico e 9caram', 'leucócitos 9mil/mm']));
  assert.equal(proven[0].text, 'suficiente');
  assert.equal(proven[3].text, 'conteúdo fisiológico e ficaram');
  assert.equal(proven[4].text, 'leucócitos 9mil/mm');
  const notProven = cleanLines(L(['paciente com 9siológico']));
  assert.equal(notProven[0].text, 'paciente com 9siológico');
});
