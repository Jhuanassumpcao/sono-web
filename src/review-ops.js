/** Operações puras de edição sobre questões da tela de revisão. */
const keyAt = (i) => String.fromCharCode(65 + i);

export function answerIndex(q) {
  return q.answer ? q.options.findIndex((o) => o.key === q.answer) : -1;
}

/** Reatribui letras A.. às alternativas; `answerIdx` é o índice da alternativa correta (ou null). */
export function relabel(q, answerIdx) {
  q.options.forEach((o, i) => { o.key = keyAt(i); });
  q.answer = answerIdx == null || answerIdx < 0 ? null : q.options[answerIdx]?.key ?? null;
}

export function addOption(q) {
  const a = answerIndex(q);
  const previous = q.answer;
  q.options.push({ key: '', text: '' });
  relabel(q, a);
  if (a < 0) q.answer = previous; // gabarito conhecido, ainda sem a alternativa correspondente
}

export function removeOption(q, idx) {
  const a = answerIndex(q);
  q.options.splice(idx, 1);
  relabel(q, a === idx ? null : a > idx ? a - 1 : a);
}

export function mergeWithPrevious(qs, i) {
  const prev = qs[i - 1];
  const cur = qs[i];
  const a = answerIndex(prev);
  const previous = prev.answer;
  prev.text = `${prev.text} ${cur.text}`.trim();
  prev.options.push(...cur.options);
  prev.images.push(...cur.images);
  relabel(prev, a);
  if (a < 0) prev.answer = previous;
  qs.splice(i, 1);
}

export function splitAfterOption(qs, i, afterIdx) {
  const q = qs[i];
  const a = answerIndex(q);
  const moved = q.options.splice(afterIdx + 1);
  const next = { id: `q-new-${Date.now()}`, subtitle: '', text: '', images: [], options: moved, answer: null };
  relabel(next, a > afterIdx ? a - afterIdx - 1 : null);
  relabel(q, a >= 0 && a <= afterIdx ? a : null);
  qs.splice(i + 1, 0, next);
}
