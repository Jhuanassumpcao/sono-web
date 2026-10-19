import { h, revokeAll } from '../dom.js';
import { icon } from '../icons.js';
import { validate } from '../validator.js';
import { listFolders, saveExam } from '../storage.js';
import { folderOptions } from '../dialogs.js';
import { getDraft, setDraft } from './import.js';
import { addOption, mergeWithPrevious, removeOption, splitAfterOption } from '../review-ops.js';

export async function mount(container) {
  const draft = getDraft();
  if (!draft) {
    location.hash = '#/import';
    return;
  }
  const folders = await listFolders();
  const urls = [];
  const imgUrl = (id) => {
    const u = URL.createObjectURL(draft.blobs[id]);
    urls.push(u);
    return u;
  };

  const report = h('div');
  const saveBtn = h('button', { class: 'primary' }, icon('check', 16), 'Salvar simulado');
  const saveError = h('div', { class: 'issue-error' });
  const confirmBox = h('input', { type: 'checkbox' });
  const confirmLabel = h('label', { class: 'row' }, confirmBox, 'Salvar mesmo com questões sem gabarito');
  const revealAllBtn = h('button', { onclick: () => {
    revealAll = !revealAll;
    revealAllBtn.replaceChildren(icon(revealAll ? 'eyeoff' : 'eye', 16), revealAll ? 'Ocultar todos os gabaritos' : 'Mostrar todos os gabaritos');
    renderQuestions();
  } }, icon('eye', 16), 'Mostrar todos os gabaritos');
  const list = h('div');
  const revealed = new Set(); // questões cujo gabarito o usuário escolheu mostrar
  let revealAll = false;
  const titleInput = h('input', { type: 'text', value: draft.title });
  const folderSelect = h('select', {}, h('option', { value: '' }, '(raiz)'),
    folderOptions(folders).map((o) => h('option', { value: o.id, selected: o.id === draft.folderId }, o.label)));

  function updateReport() {
    const r = validate(draft.questions, draft.keyFound);
    const noAnswer = r.issues.some((i) => i.code === 'NO_ANSWER');
    const errors = r.issues.filter((i) => i.level === 'error').length;
    report.replaceChildren(
      h('div', { class: 'card' },
        h('div', { class: 'row spread' }, h('strong', {}, r.summary),
          h('span', { class: `chip ${errors ? 'bad' : r.issues.length ? 'warn' : 'ok'}` },
            errors ? `${errors} erro(s) a corrigir` : r.issues.length ? 'Atenção' : 'Tudo certo')),
        r.issues.length
          ? h('ul', { class: 'issues' }, r.issues.map((i) => h('li', { class: `issue-${i.level}` }, i.message)))
          : h('div', { class: 'muted' }, 'Nenhum problema encontrado.')));
    confirmLabel.style.display = noAnswer ? '' : 'none';
    saveBtn.disabled = !r.ok || !titleInput.value.trim() || (noAnswer && !confirmBox.checked);
  }

  function structural(fn) {
    fn();
    renderQuestions();
    updateReport();
  }

  function answerBlock(q, answerSel) {
    const shown = revealAll || revealed.has(q);
    if (shown) {
      return h('div', { class: 'row' },
        h('label', { class: 'row' }, 'Gabarito:', answerSel),
        revealAll ? null : h('button', { class: 'ghost', onclick: () => { revealed.delete(q); renderQuestions(); } }, icon('eyeoff', 16), 'Ocultar'));
    }
    return h('div', { class: 'row' },
      h('span', { class: `chip ${q.answer ? 'ok' : 'warn'}` }, q.answer ? 'Gabarito definido' : 'Sem gabarito'),
      h('button', { class: 'ghost', onclick: () => { revealed.add(q); renderQuestions(); } }, icon('eye', 16), 'Mostrar e revisar gabarito'));
  }

  function renderQuestions() {
    revokeAll(urls);
    const qs = draft.questions;
    list.replaceChildren(...qs.map((q, i) => {
      const subtitleInput = h('input', { type: 'text', value: q.subtitle ?? '', placeholder: 'Subtítulo (opcional)', oninput: () => { q.subtitle = subtitleInput.value; } });
      const textArea = h('textarea', { value: q.text, oninput: () => { q.text = textArea.value; updateReport(); } });
      const answerSel = h('select', { onchange: () => { q.answer = answerSel.value || null; updateReport(); } },
        h('option', { value: '' }, '(sem gabarito)'),
        q.options.map((o) => h('option', { value: o.key, selected: o.key === q.answer }, o.key)));
      const splitSel = h('select', { onchange: () => {
        if (splitSel.value !== '') structural(() => splitAfterOption(qs, i, Number(splitSel.value)));
      } }, h('option', { value: '' }, 'Dividir após…'),
      q.options.slice(0, -1).map((o, k) => h('option', { value: k }, `alternativa ${o.key}`)));

      return h('div', { class: 'card' },
        h('div', { class: 'row spread' }, h('strong', {}, `Questão ${i + 1}`),
          h('div', { class: 'row' },
            i > 0 ? h('button', { onclick: () => structural(() => mergeWithPrevious(qs, i)) }, 'Juntar com a anterior') : null,
            q.options.length > 1 ? splitSel : null,
            h('button', { class: 'ghost danger', onclick: () => structural(() => qs.splice(i, 1)) }, icon('trash', 16), 'Remover'))),
        h('div', { style: 'margin:10px 0 8px' }, subtitleInput),
        textArea,
        q.images.map((id) => h('div', { class: 'thumb' }, h('img', { src: imgUrl(id), alt: '' }),
          h('div', { class: 'row' },
            h('button', { class: 'ghost danger', onclick: () => structural(() => { q.images = q.images.filter((x) => x !== id); }) }, 'Remover imagem'),
            qs.length > 1 ? h('select', { onchange: (e) => {
              if (e.target.value === '') return;
              const to = Number(e.target.value);
              structural(() => { q.images = q.images.filter((x) => x !== id); qs[to].images.push(id); });
            } }, h('option', { value: '' }, 'Mover para…'),
            qs.map((_, k) => (k === i ? null : h('option', { value: k }, `Questão ${k + 1}`)))) : null))),
        h('div', { style: 'margin-top:8px' }, q.options.map((o, k) => h('div', { class: 'opt-row' },
          h('span', { class: 'key' }, o.key),
          h('input', { type: 'text', value: o.text, oninput: (e) => { o.text = e.target.value; } }),
          h('button', { class: 'icon-btn', title: 'Remover alternativa', onclick: () => structural(() => removeOption(q, k)) }, icon('x', 16))))),
        h('div', { class: 'row', style: 'margin-top:8px' },
          h('button', { onclick: () => structural(() => addOption(q)) }, icon('plus', 16), 'Alternativa'),
          answerBlock(q, answerSel)));
    }));
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const questions = draft.questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
    const used = new Set(questions.flatMap((q) => q.images));
    const blobs = Object.fromEntries(Object.entries(draft.blobs).filter(([id]) => used.has(id)));
    const folderId = folderSelect.value || null;
    try {
      await saveExam({ folderId, title: titleInput.value.trim(), questions }, blobs);
    } catch (e) {
      console.error(e);
      saveError.textContent = `Não foi possível salvar: ${e.message}. Se o armazenamento estiver cheio, exporte um backup e libere espaço.`;
      updateReport();
      return;
    }
    saveError.textContent = '';
    setDraft(null);
    location.hash = folderId ? `#/folder/${folderId}` : '#/';
  });
  titleInput.addEventListener('input', updateReport);
  confirmBox.addEventListener('change', updateReport);

  container.append(
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Revisar importação'),
      h('div', { class: 'sub' }, 'Confira o que foi detectado e corrija o que precisar antes de salvar.'))),
    h('div', { class: 'card' }, h('div', { class: 'row' },
      h('label', { class: 'field', style: 'flex:2;min-width:220px' }, 'Título', titleInput),
      h('label', { class: 'field', style: 'flex:1;min-width:180px' }, 'Pasta', folderSelect))),
    h('div', { class: 'row spread' },
      h('span', { class: 'muted' }, 'Os gabaritos ficam ocultos para você não ver as respostas sem querer.'),
      revealAllBtn),
    report, list,
    h('div', { class: 'card row spread' }, confirmLabel, saveBtn), saveError);
  renderQuestions();
  updateReport();
  return () => revokeAll(urls);
}
