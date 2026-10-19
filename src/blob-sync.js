import { compressImage } from './image-compress.js';

const uploadedKey = (id) => `uploaded:${id}`;

/**
 * Sincroniza as imagens das questões com o bucket privado do Supabase (<userId>/<blobId>).
 * @param {{storage: typeof import('./storage.js'), bucket: {upload: Function, download: Function},
 *   userId: string, compress?: (b: Blob) => Promise<Blob>}} deps
 */
export function createBlobSync({ storage, bucket, userId, compress = compressImage }) {
  const downloads = new Map();
  const pathOf = (id) => `${userId}/${id}`;

  async function fetchRemote(id) {
    const { data, error } = await bucket.download(pathOf(id));
    if (error || !data) return undefined;
    await storage.putBlobWithId(id, data);
    await storage.setMeta(uploadedKey(id), true); // já existe na nuvem; não precisa subir de novo
    return data;
  }

  return {
    /** Sobe as imagens de simulados vivos que ainda não foram enviadas. Falhas não interrompem as demais. */
    async uploadPending() {
      let uploaded = 0;
      let failed = 0;
      for (const id of await storage.listImageIds()) {
        if (await storage.getMeta(uploadedKey(id))) continue;
        const local = await storage.getBlob(id);
        if (!local) continue; // ainda não baixada neste aparelho
        try {
          const prepared = await compress(local);
          const { error } = await bucket.upload(pathOf(id), prepared, { contentType: prepared.type || 'image/png', upsert: true });
          if (error) throw new Error(error.message);
          await storage.setMeta(uploadedKey(id), true);
          uploaded++;
        } catch (e) {
          console.warn(`Imagem ${id} não foi enviada`, e);
          failed++;
        }
      }
      return { uploaded, failed };
    },

    /** Devolve a imagem local; se faltar, baixa da nuvem (uma vez, mesmo com pedidos simultâneos). */
    async ensureBlob(id) {
      const local = await storage.getBlob(id);
      if (local) return local;
      if (!downloads.has(id)) {
        downloads.set(id, fetchRemote(id).finally(() => downloads.delete(id)));
      }
      return downloads.get(id);
    },
  };
}
