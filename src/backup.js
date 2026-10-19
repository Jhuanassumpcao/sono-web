import { exportAll, importAll } from './storage.js';

const BAD_BACKUP = 'Arquivo de backup inválido.';

export async function exportBackup(JSZipCtor = globalThis.JSZip) {
  const { blobs, ...data } = await exportAll();
  const zip = new JSZipCtor();
  zip.file('data.json', JSON.stringify(data));
  for (const [id, blob] of Object.entries(blobs)) zip.file(`blobs/${id}`, await blob.arrayBuffer());
  return zip.generateAsync({ type: 'blob' });
}

export async function importBackup(file, JSZipCtor = globalThis.JSZip) {
  let zip;
  try {
    zip = await JSZipCtor.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error(BAD_BACKUP);
  }
  const entry = zip.file('data.json');
  if (!entry) throw new Error(BAD_BACKUP);
  let data;
  try {
    data = JSON.parse(await entry.async('string'));
  } catch {
    throw new Error(BAD_BACKUP);
  }
  if (!Array.isArray(data.folders) || !Array.isArray(data.exams) || !Array.isArray(data.attempts)) {
    throw new Error(BAD_BACKUP);
  }
  const blobs = {};
  for (const [path, f] of Object.entries(zip.files)) {
    if (path.startsWith('blobs/') && !f.dir) blobs[path.slice(6)] = new Blob([await f.async('arraybuffer')]);
  }
  await importAll({ ...data, blobs });
  return { folders: data.folders.length, exams: data.exams.length };
}
