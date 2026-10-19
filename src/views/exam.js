import { h, revokeAll } from '../dom.js';
import { icon } from '../icons.js';
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
  if (!questions.length) {
    container.append(h('div', { class: 'notice' }, 'Este simulado não tem questões.'), h('a', { href: '#/' }, 'Voltar'));
    return;
  }
  const startedAt = Date.now();
  const answers = {};
  const marked = new Set();
  const urls = [];
  let index = 0;
  let showMap = false;
  const bar = h('div', { class: 'actionbar' });
  document.body.append(bar);

  async function render() {
    revokeAll(urls);
    const q = questions[index];
    const images = await imageElements(q.images, urls);
    const optionImages = await Promise.all(q.options.map((o) => (o.image ? imageElements([o.image], urls) : [])));
    const answered = Object.keys(answers).length;
    const pct = Math.round((answered / questions.length) * 100);

    const map = h('div', { class: 'qmap' }, questions.map((x, i) => h('button', {
      class: [answers[x.id] ? 'answered' : '', marked.has(x.id) ? 'marked' : '', i === index ? 'current' : ''].join(' '),
      title: marked.has(x.id) ? 'Marcada para revisar' : '',
      onclick: () => { index = i; render(); },
    }, String(i + 1))));

    container.replaceChildren(
      h('div', { class: 'exam-head' },
        h('div', { class: 'row spread' },
          h('div', {}, h('h1', {}, exam.title),
            h('div', { class: 'muted' }, only ? 'Refazendo apenas as questões erradas' : `Questão ${index + 1} de ${questions.length}`)),
          h('button', { onclick: () => { showMap = !showMap; render(); } }, `Questões ${showMap ? '▴' : '▾'}`)),
        h('div', { class: 'progress', title: `${answered} de ${questions.length} respondidas` }, h('div', { style: `width:${pct}%` })),
        h('div', { class: 'muted' }, `${answered}/${questions.length} respondidas${marked.size ? ` · ${marked.size} marcadas` : ''}`),
        showMap ? map : null),
      h('div', { class: 'card qcard' },
        q.subtitle ? h('div', { class: 'qtag' }, h('span', { class: 'chip' }, q.subtitle)) : null,
        h('div', { class: 'qtext' }, q.text),
        images,
        q.options.map((o, k) => h('button', {
          class: `option${answers[q.id] === o.key ? ' selected' : ''}`,
          onclick: () => { answers[q.id] = o.key; render(); },
        }, h('span', { class: 'key' }, o.key),
        h('span', { class: 'opt-body' }, o.text || (o.image ? null : h('span', { class: 'muted' }, 'Veja a imagem da questão')), optionImages[k])))));

    bar.replaceChildren(h('div', { class: 'actionbar-inner' },
      h('div', { class: 'row' },
        h('button', { disabled: index === 0, onclick: () => { index--; render(); } }, icon('back', 16), 'Anterior'),
        h('button', { disabled: index === questions.length - 1, onclick: () => { index++; render(); } }, 'Próxima', icon('next', 16))),
      h('div', { class: 'row' },
        h('button', { class: 'ghost', disabled: !answers[q.id], onclick: () => { delete answers[q.id]; render(); } }, 'Limpar'),
        h('button', { class: marked.has(q.id) ? '' : 'ghost', onclick: () => { marked.has(q.id) ? marked.delete(q.id) : marked.add(q.id); render(); } },
          icon('flag', 16), marked.has(q.id) ? 'Marcada' : 'Revisar depois'),
        h('button', { class: 'primary', onclick: finish }, icon('check', 16), 'Finalizar'))));
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

  await render();
  return () => { revokeAll(urls); bar.remove(); };
}
