import { h, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { getExam, listAttempts } from '../storage.js';

export async function mount(container, [examId]) {
  const exam = await getExam(examId);
  if (!exam) {
    container.append(h('div', { class: 'notice' }, 'Simulado não encontrado.'), h('a', { href: '#/' }, 'Voltar'));
    return;
  }
  const attempts = await listAttempts(examId);
  const pct = (a) => (a.total ? Math.round((a.score / a.total) * 1000) / 10 : 0);
  setChildren(container,
    h('div', { class: 'crumbs' }, h('a', { href: '#/' }, 'Biblioteca'), h('span', { class: 'sep' }, '/'), exam.title),
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Histórico'), h('div', { class: 'sub' }, exam.title)),
      h('a', { class: 'btn primary', href: `#/exam/${examId}` }, icon('play', 16), 'Fazer de novo')),
    attempts.length
      ? attempts.map((a) => h('div', { class: 'card row spread' },
        h('div', {}, h('strong', {}, `${a.score}/${a.total}`), ' ',
          h('span', { class: `chip ${pct(a) >= 70 ? 'ok' : pct(a) >= 50 ? 'warn' : 'bad'}` }, `${pct(a)}%`),
          h('div', { class: 'muted' }, new Date(a.finishedAt).toLocaleString('pt-BR'),
            a.questionIds && a.questionIds.length !== exam.questions.length ? ' · só erros' : '')),
        h('a', { class: 'btn', href: `#/result/${a.id}` }, 'Ver resultado')))
      : h('div', { class: 'card empty' }, h('div', { class: 'big' }, icon('history', 30)), 'Nenhuma tentativa ainda.'));
}
