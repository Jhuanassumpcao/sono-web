import { h } from '../dom.js';
import { parsePdf } from '../pdf-parser.js';
import { detect } from '../detector.js';

let draft = null;
export const setDraft = (d) => { draft = d; };
export const getDraft = () => draft;

export function mount(container) {
  const status = h('div', { class: 'muted' });
  const input = h('input', { type: 'file', accept: 'application/pdf', style: 'display:none' });
  const drop = h('div', { class: 'drop' },
    h('p', {}, 'Arraste um PDF de prova aqui'),
    h('button', { class: 'primary', onclick: () => input.click() }, 'Escolher PDF'));

  async function handle(file) {
    if (!file || file.type !== 'application/pdf') {
      status.textContent = 'Selecione um arquivo PDF.';
      return;
    }
    status.textContent = 'Lendo o PDF…';
    try {
      const parsed = await parsePdf(file);
      if (!parsed.hasText) {
        status.replaceChildren(h('div', { class: 'notice' },
          'Não encontrei texto neste PDF. Ele provavelmente é escaneado (imagem). Nesta versão só PDFs com texto selecionável são suportados.'));
        return;
      }
      const { questions, keyFound } = detect(parsed.lines, parsed.images);
      setDraft({ title: file.name.replace(/\.pdf$/i, ''), questions, blobs: parsed.blobs, keyFound });
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

  container.append(
    h('h1', {}, 'Importar PDF'),
    drop, input, status,
    h('p', { class: 'muted' }, 'O sistema detecta questões, imagens, alternativas e gabarito. Você revisa o resultado antes de salvar.'));
}
