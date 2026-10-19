# Persistência na nuvem com contas — Plano

> Para execução: use superpowers:executing-plans (ou subagent-driven-development) tarefa a tarefa.

**Objetivo:** cada usuário entra com uma conta e vê os mesmos simulados, pastas e histórico em qualquer navegador ou aparelho, sem perder dados ao limpar o navegador.

**Hoje:** tudo fica no IndexedDB do navegador (`src/storage.js`), com backup manual em zip. Os dados não saem do aparelho e não são compartilhados entre navegadores.

## Decisões de arquitetura

**Backend: Supabase (plano gratuito).** Fornece login, banco Postgres e armazenamento de arquivos. O site continua estático no GitHub Pages e fala com o Supabase direto do navegador (`@supabase/supabase-js` via CDN).
- Por que não Firebase: o Storage exige plano pago em projetos novos.
- A chave `anon` do Supabase é pública por projeto. A segurança vem de **RLS** (cada linha só é lida/escrita pelo dono, `user_id = auth.uid()`).

**Local-first.** O IndexedDB continua sendo o armazenamento principal: o app abre rápido e funciona offline. A nuvem é sincronizada em segundo plano.
- Toda alteração local vai para uma fila (`outbox`) e é enviada quando houver conexão e login.
- Na entrada e ao voltar para a aba, o app puxa o que mudou na nuvem desde a última sincronização.
- Conflito: vale a alteração mais recente (`updatedAt`) por registro. Exclusões viram marcas (`deleted: true`) para propagar.

**Sem login continua funcionando** como hoje (modo local). Login é opcional e acrescenta a sincronização.

**Imagens** vão para um bucket privado `exam-images` em `<userId>/<blobId>`. São baixadas sob demanda quando faltarem no aparelho, e redimensionadas/comprimidas antes do envio (limite do plano gratuito: 1 GB).

**Modelo na nuvem** (todas com `user_id`, `updated_at`, `deleted`):
- `folders(id, parent_id, name)`
- `exams(id, folder_id, title, created_at, questions jsonb)`
- `attempts(id, exam_id, question_ids jsonb, answers jsonb, score, total, started_at, finished_at)`

## O que você precisa fazer (eu não consigo, é a sua conta)
1. Criar um projeto em supabase.com e me passar a **Project URL** e a **anon key** (são públicas, podem ir no repositório).
2. Rodar no SQL Editor o arquivo `supabase/schema.sql` que eu vou gerar (tabelas, RLS e bucket).
3. Em Authentication → Providers: ativar **Google** (recomendado) e/ou link por e-mail. Em URL Configuration, cadastrar `https://jhuanassumpcao.github.io/sono-web/` e `http://localhost:8080`.
- Aviso: o envio de e-mail padrão do Supabase é limitado a poucos por hora; Google evita isso.

## Tarefas

### Tarefa 1 — Esquema e segurança
- Criar `supabase/schema.sql`: tabelas acima, índices em `(user_id, updated_at)`, RLS com políticas `select/insert/update/delete` por `auth.uid()`, bucket `exam-images` privado com política por pasta `<userId>/`.
- Verificação: duas contas de teste; uma não consegue ler nem escrever dados da outra (teste via SQL Editor e via API).

### Tarefa 2 — Registros com versão e exclusão lógica (`src/storage.js`)
- Todo registro ganha `updatedAt`; excluir marca `deleted: true` (`deleteFolder/deleteExam` em cascata também marcam); as listagens ignoram excluídos.
- Nova store `outbox` e `meta` (`lastSyncAt`, `userId`). Migração do banco v1 → v2 sem perder dados existentes (registros antigos recebem `updatedAt = createdAt`/agora).
- Testes (fake-indexeddb): migração preserva dados, exclusão em cascata gera marcas, cada escrita entra no outbox.

### Tarefa 3 — Motor de sincronização (`src/sync.js`, puro e testável)
- `mergeRemote(local, remote) → registro vencedor` por `updatedAt` (empate: nuvem).
- `push(outbox, client)`, `pull(since, client)`, `syncOnce({db, client})` com cliente injetável.
- Testes com cliente falso: push envia pendentes e limpa o outbox; pull aplica o mais novo; exclusão propaga; falha de rede mantém o outbox; duas edições concorrentes resolvem pela mais recente.

### Tarefa 4 — Imagens (`src/blob-sync.js`)
- Compressão antes do envio (canvas → JPEG/WebP). Envio quando o exame é salvo; download sob demanda em `getBlob` quando a imagem não existe no aparelho.
- Testes: falta local → baixa; já existe → não baixa; falha de rede não quebra a prova (mostra a questão sem a imagem).

### Tarefa 5 — Login (`src/auth.js`, tela de entrada, menu da conta)
- Cliente Supabase com `config.js` (URL e anon key). Botões "Entrar com Google" e link por e-mail; sessão persistida e renovada.
- Menu no topo: e-mail da conta, "Sincronizar agora", "Sair". Sem login, aparece "Entrar para sincronizar".
- Verificação manual: login, recarregar mantém a sessão, sair volta ao modo local.

### Tarefa 6 — Primeiro login e troca de conta
- Ao entrar pela primeira vez com dados locais: perguntar "Enviar seus N simulados locais para esta conta?" (sim: entram no outbox; não: ficam só locais).
- Ao entrar com uma conta diferente da anterior: avisar e perguntar se mantém os dados locais antigos (como backup em zip) antes de trocar. Nunca apagar dados locais sem confirmação.
- Testes: migração local→conta, troca de conta, cancelar não altera nada.

### Tarefa 7 — Indicador de estado
- Chip no topo: "Sincronizado", "Sincronizando…", "Offline — alterações pendentes (N)", "Erro ao sincronizar" com tentar de novo. Sincroniza ao abrir, ao voltar para a aba, ao reconectar e depois de cada alteração (com atraso curto).
- Verificação manual: criar offline, reconectar e ver aparecer no outro navegador.

### Tarefa 8 — Ajustes finais e publicação
- Manter o backup em zip e o pedido de `navigator.storage.persist()`. Atualizar o README (como criar o projeto Supabase, limites do plano gratuito, privacidade).
- Teste ponta a ponta com **dois navegadores**: importar PDF no A, ver no B; fazer prova no B, ver o histórico no A; excluir no A, sumir no B; editar o mesmo item nos dois, vence o mais recente.
- Publicar em `main` somente com a sua confirmação.

## Riscos e limites
- **Plano gratuito:** 500 MB de banco e 1 GB de arquivos; projetos ficam pausados após 7 dias sem uso (basta reativar no painel).
- **Privacidade e direitos autorais:** as questões de cada usuário ficam em área privada dele (RLS), mas são conteúdo de terceiros. Convém avisar na tela de login que cada um é responsável pelo que importa.
- **Reescrita do detector/telas não é necessária:** a camada de sincronização fica por baixo de `storage.js`, então as telas atuais seguem iguais.
- **Fora do escopo (agora):** compartilhar simulados entre contas, edição simultânea em tempo real, login por senha.

## Ordem sugerida
Pré-requisitos (você) → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. As tarefas 2 e 3 não dependem do Supabase real e podem começar já; da 5 em diante preciso da URL e da chave do projeto.
