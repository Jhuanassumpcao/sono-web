/**
 * O que fazer quando uma conta entra no aparelho.
 * - mesma conta de antes → só sincroniza
 * - aparelho nunca ligado a uma conta e com dados locais → perguntar se envia
 * - conta diferente da anterior → perguntar o que fazer com os dados da conta anterior
 */
export function decideAccountAction({ localUserId, sessionUserId, localCount, outboxCount }) {
  if (localUserId === sessionUserId) return { action: 'sync' };
  if (localUserId === undefined || localUserId === null) {
    return localCount > 0 ? { action: 'ask-upload' } : { action: 'sync' };
  }
  return { action: 'switch-account', hasUnsynced: outboxCount > 0 };
}

/**
 * Aplica a decisão, perguntando ao usuário quando preciso. Nunca apaga dados locais sem a escolha dele.
 * @param {{storage: typeof import('./storage.js'), userId: string, ask: {
 *   upload(count: number): Promise<boolean>,
 *   switchAccount(info: {hasUnsynced: boolean}): Promise<'backup'|'discard'|'cancel'>,
 *   backup(): Promise<void>}}} deps
 * @returns {Promise<'ready'|'cancelled'>} 'cancelled' = o chamador deve sair da conta
 */
export async function resolveAccount({ storage, userId, ask }) {
  const counts = await storage.countLive();
  const decision = decideAccountAction({
    localUserId: await storage.getMeta('userId'),
    sessionUserId: userId,
    localCount: counts.folders + counts.exams + counts.attempts,
    outboxCount: (await storage.getOutbox()).length,
  });

  if (decision.action === 'ask-upload') {
    if (await ask.upload(counts.exams + counts.folders)) await storage.enqueueAll();
  } else if (decision.action === 'switch-account') {
    const choice = await ask.switchAccount({ hasUnsynced: decision.hasUnsynced });
    if (choice === 'cancel' || choice === undefined) return 'cancelled';
    if (choice === 'backup') await ask.backup();
    await storage.wipeLocal();
  }
  await storage.setMeta('userId', userId);
  return 'ready';
}
