const STORES = ['folders', 'exams', 'blobs', 'attempts'];
let db = null;

export class StorageUnavailableError extends Error {
  constructor(cause) {
    super('Armazenamento local (IndexedDB) indisponível neste navegador.');
    this.name = 'StorageUnavailableError';
    this.cause = cause;
  }
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export async function openDb(name = 'simulados') {
  if (typeof indexedDB === 'undefined') throw new StorageUnavailableError();
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => {
        for (const s of STORES) req.result.createObjectStore(s, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
  } catch (e) {
    throw new StorageUnavailableError(e);
  }
}

export function closeDb() {
  if (db) db.close();
  db = null;
}

const store = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
const getAll = (name) => wrap(store(name).getAll());
const get = (name, id) => wrap(store(name).get(id));
const put = (name, value) => wrap(store(name, 'readwrite').put(value));
const del = (name, id) => wrap(store(name, 'readwrite').delete(id));
const clear = (name) => wrap(store(name, 'readwrite').clear());
const uuid = () => crypto.randomUUID();

// folders
export async function createFolder(name, parentId) {
  const folder = { id: uuid(), parentId, name };
  await put('folders', folder);
  return folder;
}
export const listFolders = () => getAll('folders');
export async function renameFolder(id, name) {
  await put('folders', { ...(await get('folders', id)), name });
}
export async function moveFolder(id, newParentId) {
  await put('folders', { ...(await get('folders', id)), parentId: newParentId });
}
export async function deleteFolder(id) {
  const folders = await listFolders();
  const doomed = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const f of folders) {
      if (!doomed.has(f.id) && doomed.has(f.parentId)) { doomed.add(f.id); grew = true; }
    }
  }
  for (const exam of await getAll('exams')) {
    if (doomed.has(exam.folderId)) await deleteExam(exam.id);
  }
  for (const fid of doomed) await del('folders', fid);
}

// exams
export async function saveExam({ folderId, title, questions }, blobs) {
  for (const [blobId, data] of Object.entries(blobs)) await put('blobs', { id: blobId, data });
  const exam = { id: uuid(), folderId, title, createdAt: Date.now(), questions };
  await put('exams', exam);
  return exam;
}
export const getExam = (id) => get('exams', id);
export async function listExams(folderId) {
  return (await getAll('exams')).filter((e) => e.folderId === folderId);
}
export async function renameExam(id, title) {
  await put('exams', { ...(await get('exams', id)), title });
}
export async function moveExam(id, folderId) {
  await put('exams', { ...(await get('exams', id)), folderId });
}
export async function deleteExam(id) {
  const exam = await get('exams', id);
  if (!exam) return;
  for (const q of exam.questions) for (const b of q.images) await del('blobs', b);
  for (const a of await listAttempts(id)) await del('attempts', a.id);
  await del('exams', id);
}

// blobs
export async function putBlob(blob) {
  const id = uuid();
  await put('blobs', { id, data: blob });
  return id;
}
export async function getBlob(id) {
  return (await get('blobs', id))?.data;
}

// attempts
export async function saveAttempt(a) {
  const attempt = { id: uuid(), ...a };
  await put('attempts', attempt);
  return attempt;
}
export async function listAttempts(examId) {
  return (await getAll('attempts'))
    .filter((a) => a.examId === examId)
    .sort((x, y) => y.finishedAt - x.finishedAt);
}
export const getAttempt = (id) => get('attempts', id);

// backup support
export async function exportAll() {
  const blobs = {};
  for (const b of await getAll('blobs')) blobs[b.id] = b.data;
  return {
    folders: await getAll('folders'),
    exams: await getAll('exams'),
    attempts: await getAll('attempts'),
    blobs,
  };
}
export async function importAll({ folders, exams, attempts, blobs }) {
  for (const s of STORES) await clear(s);
  for (const f of folders) await put('folders', f);
  for (const e of exams) await put('exams', e);
  for (const a of attempts) await put('attempts', a);
  for (const [id, data] of Object.entries(blobs)) await put('blobs', { id, data });
}
