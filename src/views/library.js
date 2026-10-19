import { h, setChildren } from '../dom.js';
import * as storage from '../storage.js';
import { exportBackup, importBackup } from '../backup.js';
import { confirmDialog, promptDialog, chooseFolder } from '../dialogs.js';

function descendantIds(folders, id) {
  const ids = [id];
  for (const f of folders) if (f.parentId === id) ids.push(...descendantIds(folders, f.id));
  return ids;
}

export async function mount(container) {
  const root = h('div');
  container.append(root);

  async function render() {
    const folders = await storage.listFolders();
    const exams = await storage.listExams(null);
    const examsByFolder = new Map();
    for (const f of folders) examsByFolder.set(f.id, await storage.listExams(f.id));

    const examRow = (e) => h('div', { class: 'card row spread' },
      h('div', {}, h('strong', {}, e.title), h('div', { class: 'muted' }, `${e.questions.length} questões`)),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/exam/${e.id}` }, 'Iniciar'),
        h('a', { class: 'btn', href: `#/history/${e.id}` }, 'Histórico'),
        h('button', { onclick: async () => {
          const t = await promptDialog('Renomear simulado', e.title);
          if (t) { await storage.renameExam(e.id, t); render(); }
        } }, 'Renomear'),
        h('button', { onclick: async () => {
          const dest = await chooseFolder('Mover simulado para', folders);
          if (dest !== undefined) { await storage.moveExam(e.id, dest); render(); }
        } }, 'Mover'),
        h('button', { class: 'danger', onclick: async () => {
          if (await confirmDialog(`Excluir "${e.title}" e seu histórico?`, 'Excluir')) {
            await storage.deleteExam(e.id); render();
          }
        } }, 'Excluir')));

    const folderNode = (f) => h('div', {},
      h('div', { class: 'row spread' },
        h('span', { class: 'folder-name' }, `📁 ${f.name}`),
        h('div', { class: 'row' },
          h('button', { onclick: async () => {
            const n = await promptDialog('Nome da subpasta');
            if (n) { await storage.createFolder(n, f.id); render(); }
          } }, '+ Subpasta'),
          h('button', { onclick: async () => {
            const n = await promptDialog('Renomear pasta', f.name);
            if (n) { await storage.renameFolder(f.id, n); render(); }
          } }, 'Renomear'),
          h('button', { onclick: async () => {
            const dest = await chooseFolder('Mover pasta para', folders, descendantIds(folders, f.id));
            if (dest !== undefined) { await storage.moveFolder(f.id, dest); render(); }
          } }, 'Mover'),
          h('button', { class: 'danger', onclick: async () => {
            if (await confirmDialog(`Excluir a pasta "${f.name}" com tudo que há dentro (subpastas, simulados e histórico)?`, 'Excluir')) {
              await storage.deleteFolder(f.id); render();
            }
          } }, 'Excluir'))),
      h('div', { class: 'tree' },
        (examsByFolder.get(f.id) ?? []).map(examRow),
        folders.filter((x) => x.parentId === f.id).sort((a, b) => a.name.localeCompare(b.name)).map(folderNode)));

    const fileInput = h('input', { type: 'file', accept: '.zip', style: 'display:none', onchange: async () => {
      const file = fileInput.files[0];
      if (!file) return;
      if (!(await confirmDialog('Importar o backup substitui TODOS os dados atuais. Continuar?', 'Importar'))) return;
      try {
        const c = await importBackup(file);
        alert(`Backup restaurado: ${c.folders} pastas, ${c.exams} simulados.`);
      } catch (e) {
        alert(e.message);
      }
      render();
    } });

    const topFolders = folders.filter((f) => f.parentId === null).sort((a, b) => a.name.localeCompare(b.name));
    setChildren(root,
      h('div', { class: 'row spread' },
        h('h1', {}, 'Biblioteca'),
        h('div', { class: 'row' },
          h('a', { class: 'btn primary', href: '#/import' }, 'Importar PDF'),
          h('button', { onclick: async () => {
            const blob = await exportBackup();
            const a = h('a', { href: URL.createObjectURL(blob), download: `simulados-backup-${new Date().toISOString().slice(0, 10)}.zip` });
            a.click();
            URL.revokeObjectURL(a.href);
          } }, 'Exportar backup'),
          h('button', { onclick: () => fileInput.click() }, 'Importar backup'),
          fileInput)),
      h('p', { class: 'muted' }, 'Seus simulados ficam salvos neste navegador. Faça backup de vez em quando: limpar os dados do site apaga tudo.'),
      h('div', { class: 'row' }, h('button', { onclick: async () => {
        const n = await promptDialog('Nome da nova pasta');
        if (n) { await storage.createFolder(n, null); render(); }
      } }, '+ Nova pasta')),
      exams.map(examRow),
      topFolders.map(folderNode),
      !folders.length && !exams.length ? h('div', { class: 'card muted' }, 'Nada por aqui ainda. Crie uma pasta ou importe um PDF.') : null);
  }

  await render();
}
