/** Fração do tamanho da fonte abaixo da qual dois pedaços de texto colados contam como a mesma palavra. */
const WORD_GAP_RATIO = 0.15;

/**
 * Junta os pedaços de texto de uma linha. Os PDFs costumam partir palavras em vários pedaços
 * ("Nef" + "rologia"); só colocamos espaço quando há um vão de verdade entre um pedaço e o seguinte.
 * @param {{str: string, x: number, width: number, size: number}[]} items
 */
export function joinItems(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let prev = null;
  for (const item of sorted) {
    if (prev) {
      const gap = item.x - (prev.x + prev.width);
      const hasSpace = /\s$/.test(out) || /^\s/.test(item.str);
      if (!hasSpace && gap > WORD_GAP_RATIO * (item.size || prev.size || 10)) out += ' ';
    }
    out += item.str;
    prev = item;
  }
  return out.replace(/\s+/g, ' ').trim();
}
