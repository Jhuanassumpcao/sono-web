import { h, revokeAll } from '../dom.js';
import { getExam, saveAttempt } from '../storage.js';
import { imageElements } from '../images.js';
import { score } from '../scoring.js';
import { confirmDialog } from '../dialogs.js';

export async function mount(container, [examId], query) {
  const exam = await getExam(examId);
  if (!exam) {
    container.append(h('div', { class: 'notice' }, 'Simulado não encontrado.'), h('a', { href: '#/' }, 'Voltar'));
    return;
  }
  const only = query.get('only')?.split(',').filter(Boolean);
  const questions = only ? exam.questions.filter((q) => only.includes(q.id)) : exam.questions;
  const startedAt = Date.now();
  const answers = {};
  const marked = new Set();
  const urls = [];
  let index = 0;

  async function render() {
    revokeAll(urls);
    const q = questions[index];
    const images = await imageElements(q.images, urls);
    const answered = Object.keys(answers).length;

    const map = h('div', { class: 'qmap' }, questions.map((x, i) => h('button', {
      class: [answers[x.id] ? 'answered' : '', marked.has(x.id) ? 'marked' : '', i === index ? 'current' : ''].join(' '),
      title: marked.has(x.id) ? 'Marcada para revisar' : '',
      onclick: () => { index = i; render(); },
    }, String(i + 1))));

    container.replaceChildren(
      h('div', { class: 'row spread' }, h('h1', {}, exam.title),
        h('span', { class: 'muted' }, `${answered}/${questions.length} respondidas`)),
      map,
      h('div', { class: 'card' },
        h('div', { class: 'muted' }, `Questão ${index + 1} de ${questions.length}`),
        h('p', {}, q.text),
        images,
        q.options.map((o) => h('button', {
          class: `option${answers[q.id] === o.key ? ' selected' : ''}`,
          onclick: () => { answers[q.id] = o.key; render(); },
        }, h('span', { class: 'key' }, o.key), h('span', {}, o.text)))),
      h('div', { class: 'row spread' },
        h('div', { class: 'row' },
          h('button', { disabled: index === 0, onclick: () => { index--; render(); } }, '← Anterior'),
          h('button', { disabled: index === questions.length - 1, onclick: () => { index++; render(); } }, 'Próxima →')),
        h('div', { class: 'row' },
          h('button', { disabled: !answers[q.id], onclick: () => { delete answers[q.id]; render(); } }, 'Limpar resposta'),
          h('button', { onclick: () => { marked.has(q.id) ? marked.delete(q.id) : marked.add(q.id); render(); } },
            marked.has(q.id) ? 'Desmarcar revisão' : 'Marcar para revisar'),
          h('button', { class: 'primary', onclick: finish }, 'Finalizar'))));
  }

  async function finish() {
    const unanswered = questions.length - Object.keys(answers).length;
    const parts = [];
    if (unanswered) parts.push(`${unanswered} sem resposta`);
    if (marked.size) parts.push(`${marked.size} marcadas para revisar`);
    const msg = parts.length ? `Você tem ${parts.join(' e ')}. Finalizar mesmo assim?` : 'Finalizar o simulado?';
    if (!(await confirmDialog(msg, 'Finalizar'))) return;
    const s = score(questions, answers);
    const attempt = await saveAttempt({
      examId, questionIds: questions.map((q) => q.id), answers, score: s.correct, total: s.total,
      startedAt, finishedAt: Date.now(),
    });
    location.hash = `#/result/${attempt.id}`;
  }

  if (!questions.length) {
    container.append(h('div', { class: 'notice' }, 'Este simulado não tem questões.'), h('a', { href: '#/' }, 'Voltar'));
    return;
  }
  await render();
  return () => revokeAll(urls);
}
