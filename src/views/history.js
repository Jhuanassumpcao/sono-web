import { h, setChildren } from '../dom.js';
import { getExam, listAttempts } from '../storage.js';

export async function mount(container, [examId]) {
  const exam = await getExam(examId);
  if (!exam) {
    container.append(h('div', { class: 'notice' }, 'Simulado não encontrado.'), h('a', { href: '#/' }, 'Voltar'));
    return;
  }
  const attempts = await listAttempts(examId);
  setChildren(container,
    h('h1', {}, `Histórico — ${exam.title}`),
    h('div', { class: 'row' }, h('a', { class: 'btn', href: '#/' }, 'Biblioteca'),
      h('a', { class: 'btn primary', href: `#/exam/${examId}` }, 'Fazer de novo')),
    attempts.length
      ? attempts.map((a) => h('div', { class: 'card row spread' },
        h('div', {}, h('strong', {}, `${a.score}/${a.total}`,
          ` (${a.total ? Math.round((a.score / a.total) * 1000) / 10 : 0}%)`),
        h('div', { class: 'muted' }, new Date(a.finishedAt).toLocaleString('pt-BR'),
          a.questionIds && a.questionIds.length !== exam.questions.length ? ' · só erros' : '')),
        h('a', { class: 'btn', href: `#/result/${a.id}` }, 'Ver')))
      : h('div', { class: 'card muted' }, 'Nenhuma tentativa ainda.'));
}
