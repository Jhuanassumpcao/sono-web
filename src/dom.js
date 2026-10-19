/** Cria elementos sem innerHTML, para que texto vindo de PDFs nunca seja interpretado como HTML. */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

export function revokeAll(urls) {
  for (const u of urls) URL.revokeObjectURL(u);
  urls.length = 0;
}

/** Como replaceChildren, mas achata arrays e ignora null/false. */
export function setChildren(el, ...children) {
  el.replaceChildren(...children.flat(Infinity).filter((c) => c != null && c !== false));
}
