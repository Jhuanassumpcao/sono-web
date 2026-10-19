const QUESTION_START =
  /^\s*(?:quest[aã]o\s*(\d{1,3})\s*(?:[.)\-–:](?!\d))?|(\d{1,3})\s*[.)\-–:](?!\d))\s*(\S.*)?$/i;
const OPTION_PUNCT = /^\s*\(?([A-Ea-e])\s*[.)\-–]\s+(\S.*)$/;
// formato "A texto" (sem separador): só maiúscula, para não confundir com palavras
const OPTION_BARE = /^\s*([A-E])\s+(\S.*)$/;
const MIN_BOILERPLATE_LENGTH = 12;
const MIN_BOILERPLATE_PAGES = 3;
// linha só com dígitos e um grupo de 4+ dígitos (ex.: código do rodapé "4 0001903 91")
const STRAY_CODE = /^\s*[\d\s]*\d{4,}[\d\s]*$/;
const KEY_HEADER = /^\s*(?:gabarito\b|respostas?(?:\s+corretas?)?\s*:?\s*$)/i;
// letra minúscula só vale com separador explícito, para não confundir "2 e 3" com gabarito
const KEY_PAIR = /(\d{1,3})[ \t]*(?:[-–.):][ \t]*([A-Ea-e])|([A-E]))\b/g;
const KEY_PAIRS_ONLY = /^\s*(?:\d{1,3}[ \t]*(?:[-–.):][ \t]*[A-Ea-e]|[A-E])\b[\s,;]*)+$/;
const KEY_NUMBERS_ROW = /^\s*\d{1,3}(?:\s+\d{1,3})*\s*$/;
const KEY_LETTERS_ROW = /^\s*[A-Ea-e](?:\s+[A-Ea-e])*\s*$/;
const MIN_HEADERLESS_PAIRS = 3;

function parseKey(texts) {
  const key = {};
  for (let i = 0; i < texts.length; i++) {
    const nums = KEY_NUMBERS_ROW.test(texts[i]) ? texts[i].trim().split(/\s+/) : null;
    const letters = nums && i + 1 < texts.length && KEY_LETTERS_ROW.test(texts[i + 1])
      ? texts[i + 1].trim().split(/\s+/) : null;
    if (letters && letters.length === nums.length) {
      nums.forEach((n, k) => { key[Number(n)] = letters[k].toUpperCase(); });
      i++;
      continue;
    }
    for (const m of texts[i].matchAll(KEY_PAIR)) key[Number(m[1])] = (m[2] ?? m[3]).toUpperCase();
  }
  return key;
}

/** Returns index where the answer-key region starts, or lines.length when none. */
function findKeyStart(lines) {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (KEY_HEADER.test(lines[i].text)) return i;
  }
  let i = lines.length;
  while (i > 0 && KEY_PAIRS_ONLY.test(lines[i - 1].text)) i--;
  const pairs = Object.keys(parseKey(lines.slice(i).map((l) => l.text))).length;
  return pairs >= MIN_HEADERLESS_PAIRS ? i : lines.length;
}

const before = (a, b) => a.page < b.page || (a.page === b.page && a.y <= b.y);

// letra sozinha na linha ("A"): alternativa cujo conteúdo é uma imagem ao lado
const OPTION_LONE = /^\s*\(?([A-E])\)?\s*$/;
// caracteres que algumas fontes extraem no lugar da ligadura "fi"
const LIGATURE_CHARS = '39<';
const LIGATURE_EVIDENCE = 3;
const UNIT_AFTER_DIGIT = /^(mil|mcg|mg|ml|meq|mmol|mm|cm|kg|ui|bpm|irpm|min|seg)\b/i;
const OPTION_IMAGE_MAX_DISTANCE = 70;
const DEFAULT_OPTION_COUNT = 4;

function matchOption(text) {
  const m = text.match(OPTION_PUNCT) ?? text.match(OPTION_BARE);
  if (m) return { key: m[1].toUpperCase(), text: m[2].trim() };
  const lone = text.match(OPTION_LONE);
  return lone ? { key: lone[1], text: '', lone: true } : null;
}

/**
 * Corrige "fi" extraído como "3", "9" ou "<": dentro de palavras sempre; no início da palavra só se o
 * documento provar que aquele caractere é a ligadura (3+ ocorrências dentro de palavras).
 */
function repairLigatures(texts) {
  const inWord = /([a-zà-ú])([39<])(?=[a-zà-ú])/g;
  const evidence = {};
  for (const t of texts) for (const m of t.matchAll(inWord)) evidence[m[2]] = (evidence[m[2]] ?? 0) + 1;
  const proven = new Set(Object.keys(evidence).filter((c) => evidence[c] >= LIGATURE_EVIDENCE));
  return texts.map((t) => t
    .replace(inWord, '$1fi')
    .replace(/(^|[\s(])([39<])([a-zà-ú]{2,})/g, (m, pre, ch, rest) => (
      proven.has(ch) && !UNIT_AFTER_DIGIT.test(rest) ? `${pre}fi${rest}` : m))
    .replace(/([a-zà-ú])- (?=[a-zà-ú])/g, '$1'));
}

/** Corrige ligaduras, junta palavras hifenizadas e remove rodapés e códigos repetidos. */
export function cleanLines(lines) {
  const repaired = repairLigatures(lines.map((l) => l.text));
  const fixed = lines.map((l, i) => ({ ...l, text: repaired[i] }));
  const pagesByShape = new Map();
  const shape = (t) => t.replace(/[\s\d]/g, '');
  for (const l of fixed) {
    const k = shape(l.text);
    if (!pagesByShape.has(k)) pagesByShape.set(k, new Set());
    pagesByShape.get(k).add(l.page);
  }
  return fixed.filter((l) => {
    if (STRAY_CODE.test(l.text)) return false;
    const k = shape(l.text);
    const repeated = pagesByShape.get(k).size >= MIN_BOILERPLATE_PAGES;
    const structural = QUESTION_START.test(l.text) || matchOption(l.text);
    return !(repeated && k.length >= MIN_BOILERPLATE_LENGTH && !structural);
  });
}

/**
 * Separa o corpo de uma questão em enunciado e alternativas. O início das alternativas é a última
 * linha "A ..." que tem uma "B ..." depois dela, para que "A paciente refere..." no enunciado não conte.
 * @param {{text: string, page: number, y: number}[]} body
 */
function splitBody(body) {
  let start = -1;
  body.forEach((line, i) => {
    if (matchOption(line.text)?.key === 'A' && body.slice(i + 1).some((l) => matchOption(l.text)?.key === 'B')) start = i;
  });
  const statement = (start < 0 ? body : body.slice(0, start)).map((l) => l.text.trim()).filter(Boolean);
  const options = [];
  if (start >= 0) {
    for (const line of body.slice(start)) {
      const o = matchOption(line.text);
      if (o && o.key === String.fromCharCode(65 + options.length)) {
        options.push({ key: o.key, text: o.text ? [o.text] : [], lone: Boolean(o.lone), page: line.page, y: line.y });
      } else if (line.text.trim()) {
        options[options.length - 1].text.push(line.text.trim());
      }
    }
  }
  return { statement, options };
}

/** Liga cada imagem à alternativa de letra solta mais próxima (mesma página); as demais ficam com a questão. */
function assignOptionImages(question, options, images) {
  const lone = options.filter((o) => o.lone && o.text.length === 0);
  if (lone.length < 2) return;
  const rest = [];
  for (const img of images) {
    const center = img.y + (img.drawnH ?? 0) / 2;
    let best = null;
    for (const o of lone) {
      if (o.page !== img.page) continue;
      const d = Math.abs(center - o.y);
      if (d <= OPTION_IMAGE_MAX_DISTANCE && (!best || d < best.d)) best = { o, d };
    }
    const target = best && question.options.find((qo) => qo.key === best.o.key);
    if (target && !target.image) target.image = img.blobId;
    else rest.push(img);
  }
  question.images = rest.map((i) => i.blobId);
}

/** Número de alternativas mais comum no documento (empate: o maior); serve para questões com alternativas só em figura. */
function modalOptionCount(questions) {
  const counts = new Map();
  for (const q of questions) if (q.options.length >= 2) counts.set(q.options.length, (counts.get(q.options.length) ?? 0) + 1);
  let best = DEFAULT_OPTION_COUNT;
  let bestN = 0;
  for (const [len, n] of counts) if (n > bestN || (n === bestN && len > best)) { best = len; bestN = n; }
  return best;
}

/**
 * @param {{text: string, page: number, y: number}[]} rawLines
 * @param {{blobId: string, page: number, y: number, drawnH?: number}[]} images
 */
export function detect(rawLines, images) {
  const lines = cleanLines(rawLines);
  const keyStart = findKeyStart(lines);
  const answerKey = parseKey(lines.slice(keyStart).map((l) => l.text.replace(KEY_HEADER, '')));
  const keyNumbers = Object.keys(answerKey).map(Number);
  const keyFound = keyNumbers.length > 0;
  const firstNumber = keyFound ? Math.min(...keyNumbers) : 1;

  const blocks = [];
  for (const line of lines.slice(0, keyStart)) {
    const q = line.text.match(QUESTION_START);
    const expected = blocks.length ? blocks[blocks.length - 1].number + 1 : firstNumber;
    if (q && Number(q[1] ?? q[2]) === expected) {
      blocks.push({
        number: expected, pos: { page: line.page, y: line.y }, head: q[3]?.trim() ?? '',
        headIsTag: q[1] !== undefined, body: [],
      });
    } else if (blocks.length) {
      blocks[blocks.length - 1].body.push(line);
    }
  }

  const imagesOf = blocks.map(() => []);
  for (const img of images) {
    let target = 0;
    blocks.forEach((b, i) => { if (before(b.pos, img)) target = i; });
    if (imagesOf[target]) imagesOf[target].push(img);
  }

  const questions = blocks.map((b, i) => {
    const { statement, options } = splitBody(b.body);
    // "Questão 1 Tema" costuma ser só uma etiqueta; se não há enunciado depois, a linha é o enunciado
    const isSubtitle = b.headIsTag && b.head && statement.length > 0;
    const question = {
      id: `q${b.number}`,
      subtitle: isSubtitle ? b.head : '',
      text: (isSubtitle ? statement : [b.head, ...statement]).filter(Boolean).join(' '),
      images: imagesOf[i].map((img) => img.blobId),
      options: options.map((o) => ({ key: o.key, text: o.text.join(' ') })),
      answer: answerKey[b.number] ?? null,
    };
    assignOptionImages(question, options, imagesOf[i]);
    return question;
  });

  const modal = modalOptionCount(questions);
  for (const q of questions) {
    if (q.options.length > 0 || q.images.length === 0) continue;
    const answerIdx = q.answer ? q.answer.charCodeAt(0) - 65 + 1 : 0;
    const count = Math.max(modal, answerIdx);
    q.options = Array.from({ length: count }, (_, k) => ({ key: String.fromCharCode(65 + k), text: '' }));
    q.optionsInImage = true;
  }

  return { questions, answerKey, keyFound };
}
