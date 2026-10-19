import { h } from './dom.js';
import { icon } from './icons.js';
import { menu } from './menu.js';
import { openDb, StorageUnavailableError } from './storage.js';
import { exportBackup, importBackup } from './backup.js';
import { confirmDialog } from './dialogs.js';
import * as library from './views/library.js';
import * as importView from './views/import.js';
import * as review from './views/review.js';
import * as exam from './views/exam.js';
import * as result from './views/result.js';
import * as history from './views/history.js';

const routes = { '': library, folder: library, import: importView, review, exam, result, history };
const navKeyByRoute = { '': 'library', folder: 'library', exam: 'library', result: 'library', history: 'library', import: 'import', review: 'import' };
const app = document.getElementById('app');
const nav = document.getElementById('nav');
let cleanup = null;

function parseHash() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...params] = path.split('/');
  return { name, params, query: new URLSearchParams(qs) };
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('theme', theme); } catch { /* preferência é só conveniência */ }
}

function loadTheme() {
  try {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
  } catch { /* sem armazenamento: segue o tema do sistema */ }
}

const isDark = () => (document.documentElement.dataset.theme
  ? document.documentElement.dataset.theme === 'dark'
  : matchMedia('(prefers-color-scheme: dark)').matches);

async function downloadBackup() {
  const blob = await exportBackup();
  const a = h('a', { href: URL.createObjectURL(blob), download: `simulados-backup-${new Date().toISOString().slice(0, 10)}.zip` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

function buildNav() {
  const fileInput = h('input', { type: 'file', accept: '.zip', hidden: true, onchange: async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!(await confirmDialog('Importar o backup substitui TODOS os dados atuais. Continuar?', 'Importar'))) return;
    try {
      const c = await importBackup(file);
      alert(`Backup restaurado: ${c.folders} pastas e ${c.exams} simulados.`);
    } catch (e) {
      alert(e.message);
    }
    location.hash = '#/';
    render();
  } });
  const themeBtn = h('button', { class: 'icon-btn', title: 'Alternar tema', 'aria-label': 'Alternar tema', onclick: () => {
    setTheme(isDark() ? 'light' : 'dark');
    themeBtn.replaceChildren(icon(isDark() ? 'sun' : 'moon'));
  } }, icon(isDark() ? 'sun' : 'moon'));
  const backupTrigger = h('button', { class: 'nav-btn', title: 'Backup' }, icon('database'), h('span', {}, 'Backup'));
  nav.replaceChildren(
    h('a', { href: '#/', 'data-nav': 'library' }, icon('library'), h('span', {}, 'Biblioteca')),
    h('a', { href: '#/import', 'data-nav': 'import' }, icon('upload'), h('span', {}, 'Importar PDF')),
    h('div', { class: 'nav-spacer' }),
    menu([
      { label: 'Exportar backup', icon: 'download', onClick: downloadBackup },
      { label: 'Importar backup', icon: 'upload', onClick: () => fileInput.click() },
    ], { trigger: backupTrigger }),
    themeBtn, fileInput);
}

function markActiveNav(routeName) {
  const key = navKeyByRoute[routeName];
  for (const a of nav.querySelectorAll('a[data-nav]')) a.classList.toggle('active', a.dataset.nav === key);
}

async function render() {
  if (cleanup) cleanup();
  cleanup = null;
  app.replaceChildren();
  const { name, params, query } = parseHash();
  markActiveNav(name);
  window.scrollTo(0, 0);
  const view = routes[name] ?? library;
  try {
    const c = await view.mount(app, params, query);
    if (typeof c === 'function') cleanup = c;
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'notice' }, `Erro ao abrir a tela: ${e.message}`));
  }
}

async function start() {
  loadTheme();
  buildNav();
  try {
    await openDb();
  } catch (e) {
    if (e instanceof StorageUnavailableError) {
      app.append(h('div', { class: 'notice' }, e.message,
        ' Saia do modo privado ou use outro navegador para salvar seus simulados.'));
      return;
    }
    throw e;
  }
  navigator.storage?.persist?.().catch(() => {});
  window.addEventListener('hashchange', render);
  render();
}

start();
