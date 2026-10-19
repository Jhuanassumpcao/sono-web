import { filterDecorative } from './image-filter.js';

const PDFJS_VERSION = '3.11.174';
const LINE_TOLERANCE = 5;
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

const IMAGE_LOAD_TIMEOUT_MS = 3000;

/** Imagens repetidas em várias páginas vivem em commonObjs (ids "g_..."); sem timeout o import travaria. */
function loadImageObject(pdfPage, id) {
  const store = id.startsWith('g_') ? pdfPage.commonObjs : pdfPage.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), IMAGE_LOAD_TIMEOUT_MS);
    const done = (img) => { clearTimeout(timer); resolve(img); };
    if (store.has(id)) done(store.get(id));
    else store.get(id, done);
  });
}

/** Coleta metadados das imagens (sem decodificar): args do operador são [objId, largura, altura]. */
async function collectImages(pdfPage, lib, pageNumber, viewport, images) {
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
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); if (args?.[0]) ctm = mul(ctm, args[0]); }
    else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintJpegXObject) {
      const [objId, width, height] = args;
      if (width < MIN_IMAGE_SIZE || height < MIN_IMAGE_SIZE) continue;
      // a matriz mapeia o quadrado unitário; o topo da imagem é ctm[5] + ctm[3]
      images.push({
        blobId: crypto.randomUUID(), objId, page: pageNumber, y: viewport.height - (ctm[5] + ctm[3]),
        width, height,
        drawnW: Math.hypot(ctm[0], ctm[1]), drawnH: Math.hypot(ctm[2], ctm[3]),
        pageW: viewport.width, pageH: viewport.height,
      });
    }
  }
}

/** Converte para PNG só as imagens que sobraram do filtro; as que falharem são removidas da lista. */
async function convertImages(pdf, kept, blobs) {
  const result = [];
  for (const im of kept) {
    const page = await pdf.getPage(im.page);
    const obj = await loadImageObject(page, im.objId);
    const blob = obj ? await imageToBlob(obj) : null;
    if (!blob) continue;
    blobs[im.blobId] = blob;
    result.push(im);
  }
  return result;
}

/** @param {File} file */
export async function parsePdf(file) {
  const lib = configure();
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const lines = [];
  const candidates = [];
  const blobs = {};
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    lines.push(...toLines(content.items, viewport.height, p));
    try {
      await collectImages(page, lib, p, viewport, candidates);
    } catch (e) {
      console.warn(`Imagens da página ${p} não puderam ser lidas`, e);
    }
  }
  const { kept } = filterDecorative(candidates, pdf.numPages);
  const images = await convertImages(pdf, kept, blobs);
  images.sort((a, b) => a.page - b.page || a.y - b.y);
  const hasText = lines.reduce((n, l) => n + l.text.length, 0) >= MIN_TEXT_CHARS;
  return { lines, images, blobs, hasText };
}
