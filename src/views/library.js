import { h, setChildren } from '../dom.js';
import { icon } from '../icons.js';
import { menu } from '../menu.js';
import * as storage from '../storage.js';
import { confirmDialog, promptDialog, chooseFolder } from '../dialogs.js';

function descendantIds(folders, id) {
  const ids = [id];
  for (const f of folders) if (f.parentId === id) ids.push(...descendantIds(folders, f.id));
  return ids;
}

function pathTo(folders, id) {
  const path = [];
  for (let f = folders.find((x) => x.id === id); f; f = folders.find((x) => x.id === f.parentId)) path.unshift(f);
  return path;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function scoreChip(attempt) {
  if (!attempt) return h('span', { class: 'chip neutral' }, 'Ainda não feito');
  const pct = attempt.total ? Math.round((attempt.score / attempt.total) * 100) : 0;
  return h('span', { class: `chip ${pct >= 70 ? 'ok' : pct >= 50 ? 'warn' : 'bad'}` }, `Última: ${pct}%`);
}

export async function mount(container, [folderId = null]) {
  const root = h('div');
  container.append(root);

  async function render() {
    const folders = await storage.listFolders();
    const allExams = await storage.listAllExams();
    const attempts = await storage.listAllAttempts();
    const current = folderId ? folders.find((f) => f.id === folderId) : null;
    if (folderId && !current) {
      location.hash = '#/';
      return;
    }
    const subfolders = folders.filter((f) => f.parentId === folderId).sort((a, b) => a.name.localeCompare(b.name));
    const exams = allExams.filter((e) => e.folderId === folderId).sort((a, b) => b.createdAt - a.createdAt);
    const lastAttempt = (examId) => attempts.filter((a) => a.examId === examId).sort((a, b) => b.finishedAt - a.finishedAt)[0];

    const folderTile = (f) => {
      const subs = folders.filter((x) => x.parentId === f.id).length;
      const count = allExams.filter((e) => e.folderId === f.id).length;
      return h('div', { class: 'card tile clickable', onclick: (e) => { if (!e.target.closest('.menu')) location.hash = `#/folder/${f.id}`; } },
        h('div', { class: 'tile-head' },
          h('div', { class: 'tile-ico folder' }, icon('folder', 22)),
          h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'tile-title' }, f.name),
            h('div', { class: 'muted' }, [plural(subs, 'pasta', 'pastas'), plural(count, 'simulado', 'simulados')].join(' · '))),
          menu([
            { label: 'Renomear', icon: 'edit', onClick: async () => {
              const n = await promptDialog('Renomear pasta', f.name);
              if (n) { await storage.renameFolder(f.id, n); render(); }
            } },
            { label: 'Mover', icon: 'move', onClick: async () => {
              const dest = await chooseFolder('Mover pasta para', folders, descendantIds(folders, f.id));
              if (dest !== undefined) { await storage.moveFolder(f.id, dest); render(); }
            } },
            { label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
              if (await confirmDialog(`Excluir a pasta "${f.name}" com tudo que há dentro (subpastas, simulados e histórico)?`, 'Excluir')) {
                await storage.deleteFolder(f.id); render();
              }
            } },
          ])));
    };

    const examTile = (e) => h('div', { class: 'card tile' },
      h('div', { class: 'tile-head' },
        h('div', { class: 'tile-ico' }, icon('file', 22)),
        h('div', { style: 'flex:1;min-width:0' }, h('div', { class: 'tile-title' }, e.title),
          h('div', { class: 'muted' }, plural(e.questions.length, 'questão', 'questões'))),
        menu([
          { label: 'Renomear', icon: 'edit', onClick: async () => {
            const t = await promptDialog('Renomear simulado', e.title);
            if (t) { await storage.renameExam(e.id, t); render(); }
          } },
          { label: 'Mover', icon: 'move', onClick: async () => {
            const dest = await chooseFolder('Mover simulado para', folders);
            if (dest !== undefined) { await storage.moveExam(e.id, dest); render(); }
          } },
          { label: 'Excluir', icon: 'trash', danger: true, onClick: async () => {
            if (await confirmDialog(`Excluir "${e.title}" e seu histórico?`, 'Excluir')) { await storage.deleteExam(e.id); render(); }
          } },
        ])),
      h('div', { class: 'tile-foot' }, scoreChip(lastAttempt(e.id))),
      h('div', { class: 'row' },
        h('a', { class: 'btn primary', href: `#/exam/${e.id}` }, icon('play', 16), 'Iniciar'),
        h('a', { class: 'btn', href: `#/history/${e.id}` }, icon('history', 16), 'Histórico')));

    const crumbs = [h('a', { href: '#/' }, 'Biblioteca')];
    for (const f of pathTo(folders, folderId)) crumbs.push(h('span', { class: 'sep' }, '/'), h('a', { href: `#/folder/${f.id}` }, f.name));

    setChildren(root,
      h('div', { class: 'crumbs' }, crumbs),
      h('div', { class: 'page-head' },
        h('div', {}, h('h1', {}, current ? current.name : 'Biblioteca'),
          h('div', { class: 'sub' }, 'Organize seus simulados em pastas e refaça quando quiser.')),
        h('div', { class: 'row' },
          h('button', { onclick: async () => {
            const n = await promptDialog('Nome da nova pasta');
            if (n) { await storage.createFolder(n, folderId); render(); }
          } }, icon('plus', 16), 'Nova pasta'),
          h('a', { class: 'btn primary', href: folderId ? `#/import?folder=${folderId}` : '#/import' }, icon('upload', 16), 'Importar PDF'))),
      subfolders.length ? [h('div', { class: 'section-title' }, 'Pastas'), h('div', { class: 'grid' }, subfolders.map(folderTile))] : null,
      exams.length ? [h('div', { class: 'section-title' }, 'Simulados'), h('div', { class: 'grid' }, exams.map(examTile))] : null,
      !subfolders.length && !exams.length
        ? h('div', { class: 'card empty' },
          h('div', { class: 'big' }, icon('folder', 30)),
          h('h2', {}, current ? 'Esta pasta está vazia' : 'Sua biblioteca está vazia'),
          h('p', {}, 'Crie uma pasta ou importe um PDF de prova para montar seu primeiro simulado.'),
          h('a', { class: 'btn primary', href: folderId ? `#/import?folder=${folderId}` : '#/import' }, icon('upload', 16), 'Importar PDF'))
        : null,
      h('p', { class: 'muted', style: 'margin-top:28px' },
        'Seus simulados ficam salvos neste navegador. Use o menu Backup de vez em quando: limpar os dados do site apaga tudo.'));
  }

  await render();
}
