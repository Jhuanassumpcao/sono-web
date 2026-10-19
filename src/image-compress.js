const MAX_SIDE = 1600;
const QUALITY = 0.82;

/** Reduz mantendo a proporção para caber em max×max; nunca aumenta. */
export function fitWithin(width, height, max = MAX_SIDE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Reduz e recomprime uma imagem (WebP, com JPEG como alternativa) antes de enviá-la à nuvem.
 * Se algo falhar ou o resultado ficar maior, devolve o original.
 */
export async function compressImage(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    for (const type of ['image/webp', 'image/jpeg']) {
      const out = await new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
      if (out && out.type === type) return out.size < blob.size ? out : blob;
    }
  } catch (e) {
    console.warn('Não foi possível comprimir a imagem; enviando o original.', e);
  }
  return blob;
}
