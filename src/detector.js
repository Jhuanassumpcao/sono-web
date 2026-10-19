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

function matchOption(text) {
  const m = text.match(OPTION_PUNCT) ?? text.match(OPTION_BARE);
  return m ? { key: m[1].toUpperCase(), text: m[2].trim() } : null;
}

/** Corrige "fi" extraído como "3" ou "<", junta palavras hifenizadas e remove rodapés repetidos. */
export function cleanLines(lines) {
  const fixed = lines.map((l) => ({
    ...l,
    text: l.text
      .replace(/([a-zà-ú])3(?=[a-zà-ú])/g, '$1fi')
      .replace(/([a-zà-ú])<(?=[a-zà-ú])/g, '$1fi')
      .replace(/([a-zà-ú])- (?=[a-zà-ú])/g, '$1'),
  }));
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
 */
function splitBody(body) {
  let start = -1;
  body.forEach((text, i) => {
    if (matchOption(text)?.key === 'A' && body.slice(i + 1).some((t) => matchOption(t)?.key === 'B')) start = i;
  });
  const statement = (start < 0 ? body : body.slice(0, start)).map((t) => t.trim()).filter(Boolean);
  const options = [];
  if (start >= 0) {
    for (const text of body.slice(start)) {
      const o = matchOption(text);
      if (o && o.key === String.fromCharCode(65 + options.length)) options.push({ key: o.key, text: [o.text] });
      else if (text.trim()) options[options.length - 1].text.push(text.trim());
    }
  }
  return { statement, options };
}

/**
 * @param {{text: string, page: number, y: number}[]} rawLines
 * @param {{blobId: string, page: number, y: number}[]} images
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
      blocks[blocks.length - 1].body.push(line.text);
    }
  }

  const questions = blocks.map((b) => {
    const { statement, options } = splitBody(b.body);
    // "Questão 1 Tema" costuma ser só uma etiqueta; se não há enunciado depois, a linha é o enunciado
    const isSubtitle = b.headIsTag && b.head && statement.length > 0;
    return {
      id: `q${b.number}`,
      subtitle: isSubtitle ? b.head : '',
      text: (isSubtitle ? statement : [b.head, ...statement]).filter(Boolean).join(' '),
      images: [],
      options: options.map((o) => ({ key: o.key, text: o.text.join(' ') })),
      answer: answerKey[b.number] ?? null,
    };
  });

  for (const img of images) {
    let target = 0;
    blocks.forEach((b, i) => { if (before(b.pos, img)) target = i; });
    if (questions[target]) questions[target].images.push(img.blobId);
  }

  return { questions, answerKey, keyFound };
}
