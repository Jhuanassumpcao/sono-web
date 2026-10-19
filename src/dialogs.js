import { h } from './dom.js';

function modal(title, body, buttons) {
  return new Promise((resolve) => {
    const dlg = h('dialog', {}, h('h2', {}, title), body,
      h('div', { class: 'row', style: 'justify-content:flex-end;margin-top:12px' },
        buttons.map((b) => h('button', {
          class: b.primary ? 'primary' : '',
          onclick: () => { const v = b.value(); dlg.close(); dlg.remove(); resolve(v); },
        }, b.label))));
    dlg.addEventListener('cancel', () => { dlg.remove(); resolve(undefined); });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function confirmDialog(message, okLabel = 'Confirmar') {
  const r = await modal('Confirmar', h('p', {}, message), [
    { label: 'Cancelar', value: () => false },
    { label: okLabel, value: () => true, primary: true },
  ]);
  return r === true;
}

/** Retorna o texto digitado ou null se cancelado. */
export async function promptDialog(title, initial = '') {
  const input = h('input', { type: 'text', value: initial });
  const r = await modal(title, input, [
    { label: 'Cancelar', value: () => null },
    { label: 'OK', value: () => input.value.trim() || null, primary: true },
  ]);
  return r ?? null;
}

/** Lista plana de pastas com rótulo hierárquico, excluindo `excludeIds` e seus descendentes. */
export function folderOptions(folders, excludeIds = []) {
  const out = [];
  const walk = (parentId, prefix) => {
    for (const f of folders.filter((x) => x.parentId === parentId).sort((a, b) => a.name.localeCompare(b.name))) {
      if (excludeIds.includes(f.id)) continue;
      out.push({ id: f.id, label: prefix + f.name });
      walk(f.id, `${prefix}${f.name} / `);
    }
  };
  walk(null, '');
  return out;
}

/** Retorna id da pasta, null para a raiz, ou undefined se cancelado. */
export async function chooseFolder(title, folders, excludeIds = []) {
  const select = h('select', {}, h('option', { value: '' }, '(raiz)'),
    folderOptions(folders, excludeIds).map((o) => h('option', { value: o.id }, o.label)));
  const r = await modal(title, select, [
    { label: 'Cancelar', value: () => undefined },
    { label: 'Mover', value: () => select.value || null, primary: true },
  ]);
  return r;
}
