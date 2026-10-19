const DEFAULT_DEBOUNCE_MS = 2000;

/**
 * Orquestra quando sincronizar: agrupa pedidos próximos, nunca roda duas sincronizações ao mesmo tempo
 * e publica o estado para a interface ('local' | 'idle' | 'syncing' | 'offline' | 'error').
 * @param {{sync: () => Promise<unknown>, getPending: () => Promise<number>, onStatus: (s: object) => void,
 *   isOnline?: () => boolean, schedule?: Function, clear?: Function, debounceMs?: number}} deps
 */
export function createSyncManager({
  sync, getPending, onStatus,
  isOnline = () => navigator.onLine,
  schedule = (fn, ms) => setTimeout(fn, ms),
  clear = (id) => clearTimeout(id),
  debounceMs = DEFAULT_DEBOUNCE_MS,
}) {
  let enabled = false;
  let timer = null;
  let running = null;
  let again = false;
  let lastSyncAt = null;

  const publish = (state, extra = {}) => onStatus({ state, lastSyncAt, ...extra });

  async function runOnce() {
    if (!isOnline()) {
      publish('offline', { pending: await getPending() });
      return;
    }
    publish('syncing', { pending: await getPending() });
    try {
      await sync();
      lastSyncAt = Date.now();
      publish('idle', { pending: await getPending() });
    } catch (e) {
      const pending = await getPending();
      if (!isOnline()) publish('offline', { pending });
      else publish('error', { pending, error: e.message ?? String(e) });
    }
  }

  async function syncNow() {
    if (!enabled) return;
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await runOnce();
        } while (again && enabled);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  return {
    syncNow,
    /** Pede uma sincronização em breve (várias chamadas seguidas viram uma só). */
    request() {
      if (!enabled) return;
      if (timer !== null) clear(timer);
      timer = schedule(() => { timer = null; syncNow(); }, debounceMs);
    },
    setEnabled(value) {
      enabled = value;
      if (!enabled) {
        if (timer !== null) clear(timer);
        timer = null;
        publish('local');
      }
    },
  };
}
