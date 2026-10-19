import { h } from '../dom.js';
import { icon } from '../icons.js';
import { parsePdf } from '../pdf-parser.js';
import { detect } from '../detector.js';

let draft = null;
export const setDraft = (d) => { draft = d; };
export const getDraft = () => draft;

export function mount(container, _params, query) {
  const folderId = query.get('folder');
  const status = h('div', { style: 'margin-top:14px' });
  const input = h('input', { type: 'file', accept: 'application/pdf', hidden: true });
  const drop = h('div', { class: 'drop' },
    h('div', { class: 'big' }, icon('upload', 30)),
    h('h2', {}, 'Arraste um PDF de prova aqui'),
    h('p', { class: 'muted' }, 'ou escolha um arquivo do seu computador'),
    h('button', { class: 'primary', onclick: () => input.click() }, icon('file', 16), 'Escolher PDF'));

  async function handle(file) {
    if (!file || file.type !== 'application/pdf') {
      status.replaceChildren(h('div', { class: 'notice' }, 'Selecione um arquivo PDF.'));
      return;
    }
    status.replaceChildren(h('div', { class: 'card row' }, h('span', { class: 'muted' }, `Lendo "${file.name}"… PDFs grandes podem levar alguns segundos.`)));
    try {
      const parsed = await parsePdf(file);
      if (!parsed.hasText) {
        status.replaceChildren(h('div', { class: 'notice' },
          'Não encontrei texto neste PDF. Ele provavelmente é escaneado (imagem). Nesta versão só PDFs com texto selecionável são suportados.'));
        return;
      }
      const { questions, keyFound } = detect(parsed.lines, parsed.images);
      setDraft({ title: file.name.replace(/\.pdf$/i, ''), questions, blobs: parsed.blobs, keyFound, folderId });
      location.hash = '#/review';
    } catch (e) {
      console.error(e);
      status.replaceChildren(h('div', { class: 'notice' }, `Não foi possível ler o PDF: ${e.message}`));
    }
  }

  input.addEventListener('change', () => handle(input.files[0]));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    handle(e.dataTransfer.files[0]);
  });

  const step = (n, title, text) => h('div', { class: 'step' }, h('b', {}, n), h('div', {}, h('strong', {}, title), h('div', { class: 'muted' }, text)));
  container.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Importar PDF'),
      h('div', { class: 'sub' }, 'O sistema lê questões, imagens, alternativas e gabarito do PDF.'))),
    drop, input, status,
    h('div', { class: 'steps' },
      step('1', 'Envie o PDF', 'Só PDFs com texto selecionável.'),
      step('2', 'Revise', 'Corrija o que a leitura automática errou.'),
      step('3', 'Salve e treine', 'O simulado vai para a sua biblioteca.')));
}
