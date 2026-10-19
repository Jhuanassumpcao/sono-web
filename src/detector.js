const QUESTION_START =
  /^\s*(?:quest[aã]o\s*(\d{1,3})\s*(?:[.)\-–:](?!\d))?|(\d{1,3})\s*[.)\-–:](?!\d))\s*(\S.*)?$/i;
const OPTION_START = /^\s*\(?([A-Ea-e])\s*[.)\-–]\s+(\S.*)$/;
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

/**
 * @param {{text: string, page: number, y: number}[]} lines
 * @param {{blobId: string, page: number, y: number}[]} images
 */
export function detect(lines, images) {
  const keyStart = findKeyStart(lines);
  const answerKey = parseKey(lines.slice(keyStart).map((l) => l.text.replace(KEY_HEADER, '')));
  const keyNumbers = Object.keys(answerKey).map(Number);
  const keyFound = keyNumbers.length > 0;
  const firstNumber = keyFound ? Math.min(...keyNumbers) : 1;

  const drafts = [];
  let current = null;
  for (const line of lines.slice(0, keyStart)) {
    const q = line.text.match(QUESTION_START);
    const expected = drafts.length ? drafts[drafts.length - 1].number + 1 : firstNumber;
    if (q && Number(q[1] ?? q[2]) === expected) {
      current = { number: expected, pos: { page: line.page, y: line.y }, text: [], options: [] };
      if (q[3]) current.text.push(q[3].trim());
      drafts.push(current);
      continue;
    }
    if (!current) continue;
    const text = line.text.trim();
    if (!text) continue;
    const nextKey = String.fromCharCode(65 + current.options.length);
    const o = line.text.match(OPTION_START);
    if (o && o[1].toUpperCase() === nextKey) {
      current.options.push({ key: nextKey, text: [o[2].trim()] });
    } else if (current.options.length) {
      current.options[current.options.length - 1].text.push(text);
    } else {
      current.text.push(text);
    }
  }

  const questions = drafts.map((d) => ({
    id: `q${d.number}`,
    text: d.text.join(' '),
    images: [],
    options: d.options.map((o) => ({ key: o.key, text: o.text.join(' ') })),
    answer: answerKey[d.number] ?? null,
  }));

  for (const img of images) {
    let target = 0;
    drafts.forEach((d, i) => { if (before(d.pos, img)) target = i; });
    if (questions[target]) questions[target].images.push(img.blobId);
  }

  return { questions, answerKey, keyFound };
}
