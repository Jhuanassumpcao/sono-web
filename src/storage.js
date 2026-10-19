const DB_VERSION = 2;
/** Stores com registros sincronizáveis: ganham updatedAt, exclusão lógica (deleted) e entram no outbox. */
const SYNCED = ['folders', 'exams', 'attempts'];
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

function upgrade(req, oldVersion) {
  const database = req.result;
  if (oldVersion < 1) {
    for (const s of ['folders', 'exams', 'blobs', 'attempts']) database.createObjectStore(s, { keyPath: 'id' });
  }
  if (oldVersion < 2) {
    database.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
    database.createObjectStore('meta', { keyPath: 'key' });
    if (oldVersion >= 1) {
      // registros da v1 não tinham updatedAt: usa a data mais confiável que eles já guardavam
      for (const s of SYNCED) {
        const cursorReq = req.transaction.objectStore(s).openCursor();
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;
          const v = cursor.value;
          v.updatedAt ??= v.createdAt ?? v.finishedAt ?? Date.now();
          cursor.update(v);
          cursor.continue();
        };
      }
    }
  }
}

export async function openDb(name = 'simulados') {
  if (typeof indexedDB === 'undefined') throw new StorageUnavailableError();
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(name, DB_VERSION);
      req.onupgradeneeded = (e) => upgrade(req, e.oldVersion);
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

const live = (r) => (r && !r.deleted ? r : undefined);
const liveAll = async (name) => (await getAll(name)).filter((r) => !r.deleted);

/** Grava um registro sincronizável: carimba updatedAt (sempre crescente) e o coloca no outbox. */
async function write(storeName, value) {
  const prev = await get(storeName, value.id);
  const record = { ...value, updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1) };
  await put(storeName, record);
  await put('outbox', { store: storeName, id: record.id });
  return record;
}

// folders
export const createFolder = (name, parentId) => write('folders', { id: uuid(), parentId, name });
export const listFolders = () => liveAll('folders');
export async function renameFolder(id, name) {
  await write('folders', { ...(await get('folders', id)), name });
}
export async function moveFolder(id, newParentId) {
  await write('folders', { ...(await get('folders', id)), parentId: newParentId });
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
  for (const exam of await liveAll('exams')) {
    if (doomed.has(exam.folderId)) await deleteExam(exam.id);
  }
  for (const f of folders) if (doomed.has(f.id)) await write('folders', { ...f, deleted: true });
}

// exams
export async function saveExam({ folderId, title, questions }, blobs) {
  for (const [blobId, data] of Object.entries(blobs)) await put('blobs', { id: blobId, data });
  return write('exams', { id: uuid(), folderId, title, createdAt: Date.now(), questions });
}
export async function getExam(id) {
  return live(await get('exams', id));
}
export async function listExams(folderId) {
  return (await liveAll('exams')).filter((e) => e.folderId === folderId);
}
export async function renameExam(id, title) {
  await write('exams', { ...(await get('exams', id)), title });
}
export async function moveExam(id, folderId) {
  await write('exams', { ...(await get('exams', id)), folderId });
}
export async function deleteExam(id) {
  const exam = live(await get('exams', id));
  if (!exam) return;
  for (const q of exam.questions) for (const b of q.images) await del('blobs', b);
  for (const a of await listAttempts(id)) await write('attempts', { ...a, deleted: true });
  await write('exams', { ...exam, deleted: true, questions: [] });
}
export const listAllExams = () => liveAll('exams');

// blobs (sincronizados à parte; ver tarefa 4 do plano de persistência)
export async function putBlob(blob) {
  const id = uuid();
  await put('blobs', { id, data: blob });
  return id;
}
export async function getBlob(id) {
  return (await get('blobs', id))?.data;
}

// attempts
export const saveAttempt = (a) => write('attempts', { id: uuid(), ...a });
export async function listAttempts(examId) {
  return (await liveAll('attempts'))
    .filter((a) => a.examId === examId)
    .sort((x, y) => y.finishedAt - x.finishedAt);
}
export async function getAttempt(id) {
  return live(await get('attempts', id));
}
export const listAllAttempts = () => liveAll('attempts');

// backup
export async function exportAll() {
  const blobs = {};
  for (const b of await getAll('blobs')) blobs[b.id] = b.data;
  return {
    folders: await liveAll('folders'),
    exams: await liveAll('exams'),
    attempts: await liveAll('attempts'),
    blobs,
  };
}

/** Substitui os dados atuais; o que existia e não está no backup vira exclusão (para propagar à nuvem). */
export async function importAll({ folders, exams, attempts, blobs }) {
  const incoming = { folders, exams, attempts };
  for (const s of SYNCED) {
    const keep = new Set(incoming[s].map((r) => r.id));
    for (const existing of await liveAll(s)) {
      if (keep.has(existing.id)) continue;
      await write(s, { ...existing, deleted: true, ...(s === 'exams' ? { questions: [] } : {}) });
    }
  }
  await clear('blobs');
  for (const s of SYNCED) for (const { deleted, ...r } of incoming[s]) await write(s, r);
  for (const [id, data] of Object.entries(blobs)) await put('blobs', { id, data });
}

// suporte à sincronização (ver src/sync.js)
export const getOutbox = async () => (await getAll('outbox')).sort((a, b) => a.seq - b.seq);
export async function clearOutbox(upToSeq) {
  for (const o of await getAll('outbox')) if (o.seq <= upToSeq) await del('outbox', o.seq);
}
/** Lê um registro inclusive excluído (tombstone). */
export const getRecord = (storeName, id) => get(storeName, id);
/** Grava um registro vindo da nuvem, sem carimbar nem colocar no outbox. */
export const applyRemote = (storeName, record) => put(storeName, record);
export const getMeta = async (key) => (await get('meta', key))?.value;
export const setMeta = (key, value) => put('meta', { key, value });
