import * as storage from './storage.js';
import { syncOnce } from './sync.js';
import { createCloudClient } from './cloud-client.js';
import { createBlobSync } from './blob-sync.js';
import { createSyncManager } from './sync-manager.js';
import { resolveAccount } from './account-flow.js';
import { setBlobFallback } from './images.js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const BUCKET = 'exam-images';

/**
 * Liga o app à conta na nuvem (opcional). Sem login tudo continua local.
 * @param {{ask: object, onStatus: (s: object) => void, onUser: (user: object|null) => void, onRemoteChange: () => void}} hooks
 */
export function initCloud({ ask, onStatus, onUser, onRemoteChange }) {
  // O cliente é criado já na carga do módulo para capturar o retorno do link mágico (#access_token) antes do roteador.
  const sb = globalThis.supabase?.createClient?.(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  if (!sb) {
    onStatus({ state: 'local', unavailable: true });
    return { available: false };
  }

  let userId = null;
  let manager = null;
  let teardown = () => {};

  async function activate(session) {
    userId = session.user.id;
    const outcome = await resolveAccount({ storage, userId, ask });
    if (outcome === 'cancelled') {
      userId = null;
      await sb.auth.signOut();
      return;
    }
    const client = createCloudClient({ sb, userId });
    const blobSync = createBlobSync({ storage, bucket: sb.storage.from(BUCKET), userId });
    manager = createSyncManager({
      getPending: async () => (await storage.getOutbox()).length,
      onStatus,
      sync: async () => {
        await blobSync.uploadPending(); // imagens primeiro: quem receber a questão já encontra a figura
        const { pulled } = await syncOnce({ storage, client });
        if (pulled > 0) onRemoteChange();
      },
    });
    manager.setEnabled(true);
    setBlobFallback(blobSync.ensureBlob);
    const off = storage.onChange(() => manager.request());
    const onOnline = () => manager.syncNow();
    const onVisible = () => { if (document.visibilityState === 'visible') manager.syncNow(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    teardown = () => {
      off();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      setBlobFallback(null);
      manager.setEnabled(false);
      manager = null;
    };
    onUser(session.user);
    manager.syncNow();
  }

  function deactivate() {
    teardown();
    teardown = () => {};
    userId = null;
    onUser(null);
    onStatus({ state: 'local' });
  }

  // Não aguardar chamadas do supabase dentro do callback (risco de travar); adiar para o próximo ciclo.
  sb.auth.onAuthStateChange((event, session) => {
    setTimeout(() => {
      if (session && session.user.id !== userId) activate(session).catch((e) => console.error(e));
      else if (!session && userId) deactivate();
    }, 0);
  });
  sb.auth.getSession().then(({ data }) => {
    if (data.session && data.session.user.id !== userId) return activate(data.session);
    onStatus({ state: 'local' });
    return undefined;
  }).catch((e) => console.error(e));

  return {
    available: true,
    async requestCode(email) {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: `${location.origin}${location.pathname}` },
      });
      if (error) throw new Error(error.message);
    },
    async verifyCode(email, token) {
      const { error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      await sb.auth.signOut();
    },
    syncNow: () => manager?.syncNow(),
  };
}
