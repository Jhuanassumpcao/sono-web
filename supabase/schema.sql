-- Simulados: esquema do Supabase (tarefa 1 do plano de persistência na nuvem).
--
-- Como aplicar: Supabase → SQL Editor → New query → cole este arquivo inteiro → Run.
-- É idempotente: pode rodar de novo sem duplicar nada.
--
-- Segurança: toda linha pertence a um usuário (user_id) e o RLS só deixa o dono ler e escrever.
-- A chave "anon" do projeto é pública por desenho; quem protege os dados são estas políticas.
--
-- Convenções que o cliente (src/sync.js + adaptador Supabase) segue:
--   * updated_at  = carimbo do cliente em milissegundos (mesmo valor de `updatedAt` do app); decide conflitos.
--   * deleted     = exclusão lógica; a linha continua existindo para a exclusão chegar aos outros aparelhos.
--   * synced_at   = carimbo do SERVIDOR em microssegundos, usado como cursor de leitura. Como transações
--                   podem confirmar fora de ordem, o cliente relê com uma janela de sobreposição de 10 s;
--                   isso é seguro porque aplicar o mesmo registro duas vezes não muda nada.

-- ───────────────────────────── Tabelas ─────────────────────────────

create table if not exists public.folders (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         uuid    not null,
  parent_id  uuid,
  name       text    not null,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  synced_at  bigint  not null default 0,
  primary key (user_id, id)
);

create table if not exists public.exams (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         uuid    not null,
  folder_id  uuid,
  title      text    not null,
  created_at bigint  not null,
  questions  jsonb   not null default '[]'::jsonb,
  updated_at bigint  not null,
  deleted    boolean not null default false,
  synced_at  bigint  not null default 0,
  primary key (user_id, id)
);

create table if not exists public.attempts (
  user_id      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id           uuid    not null,
  exam_id      uuid    not null,
  question_ids jsonb,
  answers      jsonb   not null default '{}'::jsonb,
  score        integer not null,
  total        integer not null,
  started_at   bigint  not null,
  finished_at  bigint  not null,
  updated_at   bigint  not null,
  deleted      boolean not null default false,
  synced_at    bigint  not null default 0,
  primary key (user_id, id)
);

create index if not exists folders_sync_idx  on public.folders  (user_id, synced_at);
create index if not exists exams_sync_idx    on public.exams    (user_id, synced_at);
create index if not exists attempts_sync_idx on public.attempts (user_id, synced_at);

-- ──────────────── Regra "vence o mais recente" e cursor de sincronização ────────────────

create or replace function public.sync_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Um envio atrasado (aparelho offline) não pode sobrescrever uma versão mais nova que já está na nuvem.
  -- Retornar NULL em BEFORE UPDATE descarta a atualização em silêncio (vale também para upsert).
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.synced_at := (extract(epoch from clock_timestamp()) * 1000000)::bigint;
  return new;
end;
$$;

drop trigger if exists folders_sync_guard  on public.folders;
drop trigger if exists exams_sync_guard    on public.exams;
drop trigger if exists attempts_sync_guard on public.attempts;

create trigger folders_sync_guard  before insert or update on public.folders  for each row execute function public.sync_guard();
create trigger exams_sync_guard    before insert or update on public.exams    for each row execute function public.sync_guard();
create trigger attempts_sync_guard before insert or update on public.attempts for each row execute function public.sync_guard();

-- ───────────────────────── RLS: só o dono acessa ─────────────────────────

alter table public.folders  enable row level security;
alter table public.exams    enable row level security;
alter table public.attempts enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['folders', 'exams', 'attempts'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);

    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete', t);
  end loop;
end
$$;

-- Sem login (role anon) nada é acessível: não há políticas para anon e os privilégios abaixo também são retirados.
revoke all on public.folders, public.exams, public.attempts from anon;
grant select, insert, update, delete on public.folders, public.exams, public.attempts to authenticated;

-- ───────────────────── Imagens: bucket privado por usuário ─────────────────────
-- Caminho dos arquivos: <user_id>/<blobId>. Só o dono lê e escreve na própria pasta.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exam-images', 'exam-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exam_images_select" on storage.objects;
drop policy if exists "exam_images_insert" on storage.objects;
drop policy if exists "exam_images_update" on storage.objects;
drop policy if exists "exam_images_delete" on storage.objects;

create policy "exam_images_select" on storage.objects for select to authenticated
  using (bucket_id = 'exam-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exam_images_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'exam-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exam_images_update" on storage.objects for update to authenticated
  using (bucket_id = 'exam-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'exam-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "exam_images_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'exam-images' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ───────────────────────── Verificação de isolamento ─────────────────────────
-- Rode DEPOIS de criar duas contas de teste (A e B) em Authentication → Users e trocar os UUIDs abaixo.
-- Cada bloco simula uma requisição autenticada daquele usuário. Esperado: B não enxerga nada de A.
--
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<UUID_DE_A>","role":"authenticated"}', true);
--   insert into public.folders (id, name, updated_at) values (gen_random_uuid(), 'Pasta de A', 1);
--   select count(*) as a_ve from public.folders;            -- esperado: 1
-- rollback;
--
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '{"sub":"<UUID_DE_B>","role":"authenticated"}', true);
--   select count(*) as b_ve from public.folders;            -- esperado: 0 (dados de A não aparecem)
--   insert into public.folders (user_id, id, name, updated_at)
--     values ('<UUID_DE_A>', gen_random_uuid(), 'Invasão', 1); -- esperado: erro de RLS
-- rollback;
