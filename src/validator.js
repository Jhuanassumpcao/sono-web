const issue = (questionId, level, code, message) => ({ questionId, level, code, message });

/**
 * @param {{id: string, text: string, options: {key: string}[], answer: string|null}[]} questions
 * @param {boolean} keyFound
 */
export function validate(questions, keyFound) {
  const issues = [];
  if (questions.length === 0) {
    issues.push(issue(null, 'error', 'NO_QUESTIONS', 'Nenhuma questão foi detectada.'));
  }
  let noAnswer = 0;
  let fewOptions = 0;
  for (const q of questions) {
    if (!q.text.trim()) issues.push(issue(q.id, 'error', 'EMPTY_TEXT', `${q.id}: enunciado vazio.`));
    if (q.options.length < 2) {
      fewOptions++;
      issues.push(issue(q.id, 'error', 'FEW_OPTIONS', `${q.id}: menos de 2 alternativas.`));
    }
    const keys = q.options.map((o) => o.key);
    if (new Set(keys).size !== keys.length) {
      issues.push(issue(q.id, 'error', 'DUPLICATE_KEY', `${q.id}: letras de alternativa repetidas.`));
    }
    if (q.answer === null) {
      noAnswer++;
      const why = keyFound ? 'não consta no gabarito' : 'gabarito não encontrado';
      issues.push(issue(q.id, 'warning', 'NO_ANSWER', `${q.id}: ${why}.`));
    } else if (!keys.includes(q.answer)) {
      issues.push(issue(q.id, 'error', 'ANSWER_NOT_IN_OPTIONS', `${q.id}: gabarito ${q.answer} não está entre as alternativas.`));
    }
  }
  const n = questions.length;
  const parts = [`${n} ${n === 1 ? 'questão detectada' : 'questões detectadas'}`];
  if (noAnswer) parts.push(`${noAnswer} sem gabarito`);
  if (fewOptions) parts.push(`${fewOptions} com menos de 2 alternativas`);
  return { issues, ok: !issues.some((i) => i.level === 'error'), summary: parts.join(', ') };
}
