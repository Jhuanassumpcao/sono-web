import { h } from './dom.js';
import { icon } from './icons.js';

document.addEventListener('click', (e) => {
  for (const pop of document.querySelectorAll('.menu-pop:not([hidden])')) {
    if (!pop.parentElement.contains(e.target)) pop.hidden = true;
  }
});

/**
 * Botão com menu suspenso.
 * @param {{label: string, icon?: string, danger?: boolean, onClick: () => void}[]} items
 * @param {{trigger?: Node, title?: string}} [opts] trigger customizado (padrão: botão ⋯)
 */
export function menu(items, { trigger, title = 'Mais ações' } = {}) {
  const pop = h('div', { class: 'menu-pop', hidden: true, role: 'menu' },
    items.map((it) => h('button', {
      class: `menu-item${it.danger ? ' danger' : ''}`, role: 'menuitem',
      onclick: () => { pop.hidden = true; it.onClick(); },
    }, it.icon ? icon(it.icon, 16) : null, it.label)));
  const btn = trigger ?? h('button', { class: 'icon-btn', title, 'aria-label': title }, icon('more', 18));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasHidden = pop.hidden;
    for (const p of document.querySelectorAll('.menu-pop')) p.hidden = true;
    pop.hidden = !wasHidden;
  });
  return h('div', { class: 'menu' }, btn, pop);
}
