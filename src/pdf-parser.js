const PDFJS_VERSION = '3.11.174';
const LINE_TOLERANCE = 3;
const MIN_TEXT_CHARS = 20;
const MIN_IMAGE_SIZE = 40;

function configure() {
  const lib = globalThis.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  return lib;
}

function toLines(items, viewportHeight, page) {
  const rows = [];
  for (const it of items) {
    if (!it.str.trim() && !it.hasEOL) continue;
    const y = viewportHeight - it.transform[5];
    const x = it.transform[4];
    let row = rows.find((r) => Math.abs(r.y - y) <= LINE_TOLERANCE);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str: it.str });
  }
  return rows
    .sort((a, b) => a.y - b.y)
    .map((r) => ({
      text: r.parts.sort((a, b) => a.x - b.x).map((p) => p.str).join(' ').replace(/\s+/g, ' ').trim(),
      page,
      y: r.y,
    }))
    .filter((l) => l.text);
}

function imageToBlob(img) {
  const { width, height } = img;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
  } else {
    const rgba = ctx.createImageData(width, height);
    const src = img.data;
    if (src.length === width * height * 4) rgba.data.set(src);
    else if (src.length === width * height * 3) {
      for (let i = 0, j = 0; i < src.length; i += 3, j += 4) {
        rgba.data[j] = src[i]; rgba.data[j + 1] = src[i + 1]; rgba.data[j + 2] = src[i + 2]; rgba.data[j + 3] = 255;
      }
    } else return null; // formatos de 1 bit/CMYK não suportados na v1
    ctx.putImageData(rgba, 0, 0);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

async function extractImages(pdfPage, lib, pageNumber, viewportHeight, blobs, images) {
  const ops = await pdfPage.getOperatorList();
  const { OPS } = lib;
  const stack = [];
  let ctm = [1, 0, 0, 1, 0, 0];
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const img = await new Promise((resolve) => {
        const get = (store) => (store.has(args[0]) ? resolve(store.get(args[0])) : false);
        if (get(pdfPage.objs) === false) pdfPage.objs.get(args[0], resolve);
      });
      if (!img || img.width < MIN_IMAGE_SIZE || img.height < MIN_IMAGE_SIZE) continue;
      const blob = await imageToBlob(img);
      if (!blob) continue;
      const blobId = crypto.randomUUID();
      blobs[blobId] = blob;
      // a matriz mapeia o quadrado unitário; o topo da imagem é ctm[5] + ctm[3]
      images.push({ blobId, page: pageNumber, y: viewportHeight - (ctm[5] + ctm[3]) });
    }
  }
}

/** @param {File} file */
export async function parsePdf(file) {
  const lib = configure();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  const images = [];
  const blobs = {};
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    lines.push(...toLines(content.items, viewport.height, p));
    try {
      await extractImages(page, lib, p, viewport.height, blobs, images);
    } catch (e) {
      console.warn(`Imagens da página ${p} não puderam ser extraídas`, e);
    }
  }
  images.sort((a, b) => a.page - b.page || a.y - b.y);
  const hasText = lines.reduce((n, l) => n + l.text.length, 0) >= MIN_TEXT_CHARS;
  return { lines, images, blobs, hasText };
}
