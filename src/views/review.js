import { h, revokeAll } from '../dom.js';
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
  const saveBtn = h('button', { class: 'primary' }, 'Salvar simulado');
  const saveError = h('div', { class: 'issue-error' });
  const confirmBox = h('input', { type: 'checkbox' });
  const confirmLabel = h('label', { class: 'row' }, confirmBox, 'Salvar mesmo com questões sem gabarito');
  const list = h('div');
  const titleInput = h('input', { type: 'text', value: draft.title });
  const folderSelect = h('select', {}, h('option', { value: '' }, '(raiz)'),
    folderOptions(folders).map((o) => h('option', { value: o.id }, o.label)));

  function updateReport() {
    const r = validate(draft.questions, draft.keyFound);
    const noAnswer = r.issues.some((i) => i.code === 'NO_ANSWER');
    report.replaceChildren(
      h('div', { class: 'card' }, h('strong', {}, r.summary),
        r.issues.length ? h('ul', {}, r.issues.map((i) => h('li', { class: `issue-${i.level}` }, i.message))) : h('div', { class: 'muted' }, 'Nenhum problema encontrado.')));
    confirmLabel.style.display = noAnswer ? '' : 'none';
    saveBtn.disabled = !r.ok || !titleInput.value.trim() || (noAnswer && !confirmBox.checked);
  }

  function structural(fn) {
    fn();
    renderQuestions();
    updateReport();
  }

  function renderQuestions() {
    revokeAll(urls);
    const qs = draft.questions;
    list.replaceChildren(...qs.map((q, i) => {
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
            h('button', { class: 'danger', onclick: () => structural(() => qs.splice(i, 1)) }, 'Remover questão'))),
        textArea,
        q.images.map((id) => h('div', { class: 'thumb' }, h('img', { src: imgUrl(id), alt: '' }),
          h('div', { class: 'row' },
            h('button', { onclick: () => structural(() => { q.images = q.images.filter((x) => x !== id); }) }, 'Remover'),
            qs.length > 1 ? h('select', { onchange: (e) => {
              if (e.target.value === '') return;
              const to = Number(e.target.value);
              structural(() => { q.images = q.images.filter((x) => x !== id); qs[to].images.push(id); });
            } }, h('option', { value: '' }, 'Mover…'),
            qs.map((_, k) => (k === i ? null : h('option', { value: k }, `Questão ${k + 1}`)))) : null))),
        q.options.map((o, k) => h('div', { class: 'row', style: 'margin:4px 0' },
          h('span', { class: 'key' }, o.key),
          h('input', { type: 'text', value: o.text, oninput: (e) => { o.text = e.target.value; } }),
          h('button', { onclick: () => structural(() => removeOption(q, k)) }, '✕'))),
        h('div', { class: 'row' },
          h('button', { onclick: () => structural(() => addOption(q)) }, '+ Alternativa'),
          h('label', { class: 'row' }, 'Gabarito:', answerSel)));
    }));
  }

  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true;
    const questions = draft.questions.map((q, i) => ({ ...q, id: `q${i + 1}` }));
    const used = new Set(questions.flatMap((q) => q.images));
    const blobs = Object.fromEntries(Object.entries(draft.blobs).filter(([id]) => used.has(id)));
    try {
      await saveExam({ folderId: folderSelect.value || null, title: titleInput.value.trim(), questions }, blobs);
    } catch (e) {
      console.error(e);
      saveError.textContent = `Não foi possível salvar: ${e.message}. Se o armazenamento estiver cheio, exporte um backup e libere espaço.`;
      updateReport();
      return;
    }
    saveError.textContent = '';
    setDraft(null);
    location.hash = '#/';
  });
  titleInput.addEventListener('input', updateReport);
  confirmBox.addEventListener('change', updateReport);

  container.append(
    h('h1', {}, 'Revisar importação'),
    h('p', { class: 'muted' }, 'Confira o que foi detectado e corrija o que precisar antes de salvar.'),
    h('div', { class: 'card row' }, h('label', {}, 'Título ', titleInput), h('label', {}, 'Pasta ', folderSelect)),
    report, list,
    h('div', { class: 'card row spread' }, confirmLabel, saveBtn), saveError);
  renderQuestions();
  updateReport();
  return () => revokeAll(urls);
}
