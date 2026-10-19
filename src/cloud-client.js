/** Janela de releitura antes do cursor (µs): transações podem confirmar fora de ordem; reaplicar é inofensivo. */
export const PULL_OVERLAP = 10_000_000;
const DEFAULT_PAGE_SIZE = 1000;

/** Campos de cada tabela: [nome no app, coluna no banco]. `id`, `updatedAt` e `deleted` são comuns. */
const FIELDS = {
  folders: [['parentId', 'parent_id'], ['name', 'name']],
  exams: [['folderId', 'folder_id'], ['title', 'title'], ['createdAt', 'created_at'], ['questions', 'questions']],
  attempts: [
    ['examId', 'exam_id'], ['questionIds', 'question_ids'], ['answers', 'answers'], ['score', 'score'],
    ['total', 'total'], ['startedAt', 'started_at'], ['finishedAt', 'finished_at'],
  ],
};

/** Registro do app → linha do banco. */
export function toRow(table, record, userId) {
  const row = { user_id: userId, id: record.id };
  for (const [field, column] of FIELDS[table]) {
    if (record[field] !== undefined) row[column] = record[field];
  }
  row.updated_at = record.updatedAt;
  row.deleted = record.deleted === true;
  return row;
}

/** Linha do banco → registro do app (sem user_id/synced_at; `deleted` só em exclusões). */
export function fromRow(table, row) {
  const record = { id: row.id };
  for (const [field, column] of FIELDS[table]) {
    if (row[column] !== null && row[column] !== undefined) record[field] = row[column];
    else if (field === 'parentId' || field === 'folderId') record[field] = null;
  }
  record.updatedAt = row.updated_at;
  if (row.deleted) record.deleted = true;
  return record;
}

/**
 * Adaptador entre o motor de sincronização e o Supabase.
 * @param {{sb: object, userId: string, pageSize?: number}} deps  `sb` é o cliente do supabase-js
 */
export function createCloudClient({ sb, userId, pageSize = DEFAULT_PAGE_SIZE }) {
  return {
    async push(table, records) {
      const rows = records.map((r) => toRow(table, r, userId));
      const { error } = await sb.from(table).upsert(rows, { onConflict: 'user_id,id' });
      if (error) throw new Error(error.message);
    },

    async pull(table, cursor) {
      const since = Math.max(0, (cursor ?? 0) - PULL_OVERLAP);
      const rows = [];
      let maxSynced = cursor ?? 0;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await sb.from(table).select('*').gt('synced_at', since)
          .order('synced_at', { ascending: true }).range(from, from + pageSize - 1);
        if (error) throw new Error(error.message);
        for (const row of data) {
          rows.push(fromRow(table, row));
          if (row.synced_at > maxSynced) maxSynced = row.synced_at;
        }
        if (data.length < pageSize) break;
      }
      return { rows, cursor: maxSynced };
    },
  };
}
