/**
 * @param {{id: string, answer: string|null}[]} questions
 * @param {Record<string, string>} answers
 */
export function score(questions, answers) {
  const perQuestion = questions.map((q) => {
    const chosen = answers[q.id] ?? null;
    return { questionId: q.id, chosen, correct: q.answer !== null && chosen === q.answer };
  });
  const correct = perQuestion.filter((p) => p.correct).length;
  const total = questions.length;
  const percent = total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;
  return { correct, total, percent, perQuestion };
}
