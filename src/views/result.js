import { h, revokeAll, setChildren } from '../dom.js';
import { getAttempt, getExam } from '../storage.js';
import { imageElements } from '../images.js';
import { score } from '../scoring.js';

export async function mount(container, [attemptId]) {
  const attempt = await getAttempt(attemptId);
  const exam = attempt && (await getExam(attempt.examId));
  if (!exam) {
    container.append(h('div', { class: 'notice' }, 'Resultado não encontrado (o simulado pode ter sido excluído).'), h('a', { href: '#/' }, 'Voltar'));
    return;
  }
  const questions = attempt.questionIds
    ? exam.questions.filter((q) => attempt.questionIds.includes(q.id))
    : exam.questions;
  const result = score(questions, attempt.answers);
  const urls = [];
  let onlyWrong = false;

  async function render() {
    revokeAll(urls);
    const wrongIds = result.perQuestion.filter((p) => !p.correct).map((p) => p.questionId);
    const cards = [];
    for (const [i, q] of questions.entries()) {
      const p = result.perQuestion[i];
      if (onlyWrong && p.correct) continue;
      const images = await imageElements(q.images, urls);
      cards.push(h('div', { class: 'card' },
        h('div', { style: `color:var(--${p.correct ? 'ok' : 'bad'})` },
          `Questão ${i + 1} — ${p.correct ? 'Certa' : p.chosen ? 'Errada' : 'Sem resposta'}`),
        h('p', {}, q.text),
        images,
        q.options.map((o) => h('div', {
          class: `option${o.key === q.answer ? ' correct' : o.key === p.chosen ? ' wrong' : ''}`,
        }, h('span', { class: 'key' }, o.key), h('span', {}, o.text))),
        h('div', { class: 'muted' }, `Sua resposta: ${p.chosen ?? '—'} · Gabarito: ${q.answer ?? 'não informado'}`)));
    }
    setChildren(container,
      h('h1', {}, exam.title),
      h('div', { class: 'card' },
        h('div', { class: 'score' }, `${result.percent}%`),
        h('div', {}, `${result.correct} de ${result.total} questões corretas`)),
      h('div', { class: 'row' },
        h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: onlyWrong, onchange: (e) => { onlyWrong = e.target.checked; render(); } }), 'Mostrar só os erros'),
        wrongIds.length ? h('a', { class: 'btn primary', href: `#/exam/${exam.id}?only=${wrongIds.join(',')}` }, 'Refazer só os erros') : null,
        h('a', { class: 'btn', href: `#/exam/${exam.id}` }, 'Refazer tudo'),
        h('a', { class: 'btn', href: `#/history/${exam.id}` }, 'Histórico'),
        h('a', { class: 'btn', href: '#/' }, 'Biblioteca')),
      cards);
  }

  await render();
  return () => revokeAll(urls);
}
