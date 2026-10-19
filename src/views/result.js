import { h, revokeAll, setChildren } from '../dom.js';
import { icon } from '../icons.js';
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
  const wrongIds = result.perQuestion.filter((p) => !p.correct).map((p) => p.questionId);
  const blankCount = result.perQuestion.filter((p) => p.chosen === null).length;
  const wrongCount = wrongIds.length - blankCount;
  const urls = [];
  let filter = 'all';

  const ringColor = result.percent >= 70 ? 'var(--ok)' : result.percent >= 50 ? 'var(--warn)' : 'var(--bad)';
  const stat = (n, label) => h('div', { class: 'stat' }, h('b', {}, String(n)), h('span', { class: 'muted' }, label));

  async function render() {
    revokeAll(urls);
    const cards = [];
    for (const [i, q] of questions.entries()) {
      const p = result.perQuestion[i];
      const status = p.correct ? 'ok' : p.chosen ? 'bad' : 'blank';
      if (filter === 'wrong' && p.correct) continue;
      if (filter === 'blank' && p.chosen !== null) continue;
      const images = await imageElements(q.images, urls);
      const optionImages = await Promise.all(q.options.map((o) => (o.image ? imageElements([o.image], urls) : [])));
      cards.push(h('div', { class: `card qcard result-card ${status}` },
        h('div', { class: 'row spread qtag' },
          h('div', { class: 'row' }, h('strong', {}, `Questão ${i + 1}`), q.subtitle ? h('span', { class: 'chip' }, q.subtitle) : null),
          h('span', { class: `chip ${status === 'blank' ? 'warn' : status}` }, p.correct ? 'Certa' : p.chosen ? 'Errada' : 'Sem resposta')),
        h('div', { class: 'qtext' }, q.text),
        images,
        q.options.map((o, k) => h('div', {
          class: `option static${o.key === q.answer ? ' correct' : o.key === p.chosen ? ' wrong' : ''}`,
        }, h('span', { class: 'key' }, o.key),
        h('span', { class: 'opt-body' }, o.text || (o.image ? null : h('span', { class: 'muted' }, 'Veja a imagem da questão')), optionImages[k]))),
        h('div', { class: 'muted' }, `Sua resposta: ${p.chosen ?? '—'} · Gabarito: ${q.answer ?? 'não informado'}`)));
    }
    const tab = (key, label) => h('button', { class: filter === key ? 'active' : '', onclick: () => { filter = key; render(); } }, label);
    setChildren(container,
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, exam.title), h('div', { class: 'sub' }, 'Resultado do simulado'))),
      h('div', { class: 'card score-card' },
        h('div', { class: 'ring', style: `--p:${result.percent};--ring-color:${ringColor}` }, h('div', {}, `${Math.round(result.percent)}%`)),
        h('div', {},
          h('h2', {}, `${result.correct} de ${result.total} questões corretas`),
          h('div', { class: 'stats' }, stat(result.correct, 'Acertos'), stat(wrongCount, 'Erros'), stat(blankCount, 'Em branco')),
          h('div', { class: 'row', style: 'margin-top:14px' },
            wrongIds.length ? h('a', { class: 'btn primary', href: `#/exam/${exam.id}?only=${wrongIds.join(',')}` }, icon('refresh', 16), 'Refazer só os erros') : null,
            h('a', { class: 'btn', href: `#/exam/${exam.id}` }, 'Refazer tudo'),
            h('a', { class: 'btn', href: `#/history/${exam.id}` }, icon('history', 16), 'Histórico'),
            h('a', { class: 'btn', href: '#/' }, 'Biblioteca')))),
      h('div', { class: 'tabs' }, tab('all', 'Todas'), tab('wrong', `Erradas e em branco (${wrongIds.length})`), tab('blank', `Em branco (${blankCount})`)),
      cards);
  }

  await render();
  return () => revokeAll(urls);
}
