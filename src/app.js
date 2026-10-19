import { h } from './dom.js';
import { openDb, StorageUnavailableError } from './storage.js';
import * as library from './views/library.js';
import * as importView from './views/import.js';
import * as review from './views/review.js';
import * as exam from './views/exam.js';
import * as result from './views/result.js';
import * as history from './views/history.js';

const routes = { '': library, import: importView, review, exam, result, history };
const app = document.getElementById('app');
let cleanup = null;

function parseHash() {
  const [path, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name = '', ...params] = path.split('/');
  return { name, params, query: new URLSearchParams(qs) };
}

async function render() {
  if (cleanup) cleanup();
  cleanup = null;
  app.replaceChildren();
  const { name, params, query } = parseHash();
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
