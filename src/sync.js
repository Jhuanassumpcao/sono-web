/** Tabelas sincronizadas, na ordem em que são enviadas e recebidas. */
export const TABLES = ['folders', 'exams', 'attempts'];

/**
 * Resolve um conflito por registro: vence o `updatedAt` mais recente; empate vai para a nuvem.
 * @returns o próprio objeto vencedor (local ou remoto)
 */
export function mergeRemote(local, remote) {
  if (!local) return remote;
  return remote.updatedAt >= local.updatedAt ? remote : local;
}

/** Envia o outbox (um registro por id, na versão mais recente) e só então o esvazia até o último item enviado. */
async function push({ storage, client }) {
  const outbox = await storage.getOutbox();
  if (!outbox.length) return 0;
  const maxSeq = outbox[outbox.length - 1].seq;
  const pending = new Map();
  for (const { store, id } of outbox) pending.set(`${store}/${id}`, { store, id });
  const rowsByTable = Object.fromEntries(TABLES.map((t) => [t, []]));
  for (const { store, id } of pending.values()) {
    const record = await storage.getRecord(store, id);
    if (record) rowsByTable[store].push(record);
  }
  let pushed = 0;
  for (const table of TABLES) {
    if (!rowsByTable[table].length) continue;
    await client.push(table, rowsByTable[table]);
    pushed += rowsByTable[table].length;
  }
  await storage.clearOutbox(maxSeq); // escritas feitas durante o envio têm seq maior e permanecem
  return pushed;
}

/** Traz o que mudou na nuvem desde o último cursor e aplica só o que for mais novo que a cópia local. */
async function pull({ storage, client }) {
  let pulled = 0;
  for (const table of TABLES) {
    const cursor = await storage.getMeta(`cursor:${table}`);
    const { rows, cursor: next } = await client.pull(table, cursor);
    for (const remote of rows) {
      const local = await storage.getRecord(table, remote.id);
      if (mergeRemote(local, remote) !== remote) continue;
      await storage.applyRemote(table, remote);
      if (!local || remote.updatedAt > local.updatedAt) pulled++;
    }
    if (next !== undefined) await storage.setMeta(`cursor:${table}`, next);
  }
  return pulled;
}

/**
 * Uma rodada de sincronização: envia as alterações locais e depois busca as da nuvem.
 * Em caso de falha de rede o erro sobe e o outbox permanece intacto.
 * @param {{storage: typeof import('./storage.js'), client: {push(table: string, rows: object[]): Promise<void>, pull(table: string, cursor: unknown): Promise<{rows: object[], cursor: unknown}>}}} deps
 */
export async function syncOnce(deps) {
  const pushed = await push(deps);
  const pulled = await pull(deps);
  return { pushed, pulled };
}
