import { getBlob } from './storage.js';
import { h } from './dom.js';

/** Cria <img> para cada blob salvo; as URLs criadas vão para `urls` (revogue com revokeAll). */
export async function imageElements(blobIds, urls) {
  const out = [];
  for (const id of blobIds) {
    const blob = await getBlob(id);
    if (!blob) continue;
    const url = URL.createObjectURL(blob);
    urls.push(url);
    out.push(h('img', { class: 'qimg', src: url, alt: 'Imagem da questão' }));
  }
  return out;
}
