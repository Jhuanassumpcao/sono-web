const BACKGROUND_AREA_RATIO = 0.6;
const REPEAT_PAGE_RATIO = 0.5;
const MIN_REPEAT_PAGES = 2;

/**
 * Separa imagens decorativas (marca d'água, logo de cabeçalho, fundo de página) das figuras da prova.
 * Decorativa = ocupa a maior parte da página, ou tem os mesmos pixels em pelo menos metade das páginas.
 * @param {{blobId: string, page: number, width: number, height: number, drawnW: number, drawnH: number, pageW: number, pageH: number}[]} images
 * @param {number} pageCount
 */
export function filterDecorative(images, pageCount) {
  const pagesBySize = new Map();
  for (const im of images) {
    const k = `${im.width}x${im.height}`;
    if (!pagesBySize.has(k)) pagesBySize.set(k, new Set());
    pagesBySize.get(k).add(im.page);
  }
  const minPages = Math.max(MIN_REPEAT_PAGES, Math.ceil(pageCount * REPEAT_PAGE_RATIO));
  const kept = [];
  const dropped = [];
  for (const im of images) {
    const background = (im.drawnW * im.drawnH) / (im.pageW * im.pageH) >= BACKGROUND_AREA_RATIO;
    const repeated = pagesBySize.get(`${im.width}x${im.height}`).size >= minPages;
    (background || repeated ? dropped : kept).push(im);
  }
  return { kept, dropped };
}
