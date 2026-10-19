import { getBlob } from './storage.js';
import { h } from './dom.js';

let fallback = null;
/** Registra como buscar uma imagem que não está neste aparelho (ex.: baixar da nuvem). */
export function setBlobFallback(fn) {
  fallback = fn;
}

/** Cria <img> para cada blob salvo; as URLs criadas vão para `urls` (revogue com revokeAll). */
export async function imageElements(blobIds, urls) {
  const out = [];
  for (const id of blobIds) {
    let blob = await getBlob(id);
    if (!blob && fallback) {
      try {
        blob = await fallback(id);
      } catch (e) {
        console.warn(`Imagem ${id} indisponível`, e);
      }
    }
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls.push(url);
    out.push(h('img', { class: 'qimg', src: url, alt: 'Imagem da questão' }));
  }
  return out;
}
