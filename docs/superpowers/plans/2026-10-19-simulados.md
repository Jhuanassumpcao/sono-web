# Simulados a partir de PDFs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Site estático em que cada usuário importa PDFs de prova, revisa as questões detectadas e faz simulados online com pontuação, salvos no navegador.

**Architecture:** HTML + ES modules sem build. Lógica pura (`detector`, `validator`, `scoring`) separada de I/O (`pdf-parser`, `storage`, `backup`) e das views. Testes com `node --test` nos módulos puros e no storage (via `fake-indexeddb`); views verificadas manualmente no navegador.

**Tech Stack:** JavaScript ES modules, pdf.js (`pdfjs-dist@3.11.174` via cdnjs, build clássica com `pdfjsLib` global), JSZip (`jszip@3.10.1` via cdnjs), IndexedDB, Node ≥ 18 só para testes, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-10-19-simulados-design.md`

## Global Constraints

- Sem banco de dados nem backend; site 100% estático, sem etapa de build.
- Dados só no navegador (IndexedDB); devem sobreviver a fechar e reabrir o navegador.
- Backup: exportar/importar tudo (JSON + imagens em zip).
- Só PDFs com texto selecionável; PDF sem texto extraível gera aviso de provável escaneado (sem OCR na v1).
- Português como idioma principal; aceitar variações de formatação.
- Pontuação: 1 ponto por acerto, com percentual; sem pesos nem penalidade.
- Sem resposta pré-selecionada na prova.
- Revisão obrigatória antes de salvar; questão sem gabarito ou com <2 alternativas só salva com correção ou confirmação explícita.
- Scripts externos só de cdnjs.cloudflare.com, com versão exata.

## Review Focus

- PDF de página única com 1 questão: deve importar sem erro.
- Gabarito em letras minúsculas (`1-c`) ou com espaços (`1 - C`): deve casar com as alternativas maiúsculas.
- Alternativas com texto em várias linhas: devem ser concatenadas, não viram novas alternativas.
- Numeração dentro do texto do enunciado (ex.: "em 2019. Considere") não pode virar nova questão.
- Gabarito referindo questão inexistente ou questão sem gabarito: aviso no relatório, sem quebrar.
- Prova com 0 acertos / 0 respondidas: nota 0%, sem divisão por zero.
- Excluir pasta com simulados dentro: remove tudo em cascata (incluindo blobs e tentativas), sem deixar órfãos.
- IndexedDB indisponível: mensagem clara com oferta de backup, sem tela em branco.

---

## File Structure

```
index.html            shell + <script> de pdf.js e JSZip (cdnjs)
styles.css
src/app.js            roteador por hash + montagem das views
src/scoring.js        puro
src/detector.js       puro
src/validator.js      puro
src/pdf-parser.js     pdf.js -> {lines, images}
src/storage.js        IndexedDB
src/backup.js         zip export/import
src/views/library.js  src/views/import.js  src/views/review.js
src/views/exam.js     src/views/result.js  src/views/history.js
tests/*.test.mjs
package.json          scripts.test = "node --test tests/", devDependency fake-indexeddb
```

Tipos compartilhados (JSDoc, usados por todas as tasks):

- `Line = {text: string, page: number, y: number}` (y cresce para baixo, em pontos do PDF)
- `ImageRef = {blobId: string, page: number, y: number}`
- `Option = {key: string, text: string}` (key maiúscula: "A".."Z")
- `Question = {id: string, text: string, images: string[], options: Option[], answer: string|null}`
- `Issue = {questionId: string|null, level: "error"|"warning", code: string, message: string}`

---

### Task 1: Scaffold e scoring

**Files:**
- Create: `package.json`, `.gitignore` (`node_modules/`), `src/scoring.js`, `tests/scoring.test.mjs`

**Interfaces:**
- Produces: `score(questions: Question[], answers: Record<string,string>) -> {correct: number, total: number, percent: number, perQuestion: {questionId: string, chosen: string|null, correct: boolean}[]}`

- [ ] **Step 1:** `git init`; criar `package.json` (`"type":"module"`, script `test`, devDependency `fake-indexeddb`) e rodar `npm install`.
- [ ] **Step 2: Write failing tests** em `tests/scoring.test.mjs`: `all correct -> percent 100`; `unanswered counts as wrong, chosen null`; `zero questions -> percent 0 (no NaN)`; `answer null in question is never correct`.
- [ ] **Step 3:** Run `npm test` — Expected: FAIL (módulo inexistente).
- [ ] **Step 4:** Implementar `score` em `src/scoring.js`; `percent` arredondado a 1 casa decimal.
- [ ] **Step 5:** Run `npm test` — Expected: PASS.
- [ ] **Step 6:** Commit `feat: scaffold and scoring`.

### Task 2: Detector de questões

**Files:**
- Create: `src/detector.js`, `tests/detector.test.mjs`

**Interfaces:**
- Consumes: `Line`, `ImageRef`
- Produces: `detect(lines: Line[], images: ImageRef[]) -> {questions: Question[], answerKey: Record<string,string>, keyFound: boolean}`; `answerKey` mapeia número da questão (string) para letra maiúscula; `question.id` é `"q"+número`; as respostas do gabarito já vêm aplicadas em `question.answer` quando a questão existe.

Regras: início de questão = linha começando por `^\s*(quest[aã]o\s*)?(\d{1,3})\s*[.)\-–:]\s+\S` onde o número é sequencial (esperado = último+1, ou 1 no começo) — isso cumpre o review focus de números dentro do enunciado. Alternativa = linha começando por `^\s*\(?([A-Ea-e])\s*[.)\-–]\s+\S`; linhas seguintes que não casam com nada continuam a alternativa/enunciado atual. Gabarito: região a partir da linha que casa `/gabarito/i` (ou, sem cabeçalho, o último bloco com ≥3 pares `n-L`), aceitando `1-C`, `1 - c`, `1) C`, `1. C`, e várias por linha. Imagens são anexadas à questão cujo intervalo (página, y) as contém; imagem antes da primeira questão vai para a primeira.

- [ ] **Step 1: Write failing tests** (nomes): `detects numbered questions with A) options`; `joins multi-line option text`; `ignores year inside statement as new question`; `parses 'Gabarito: 1-C 2-A' inline`; `parses answer key one per line, lowercase, spaced`; `answer for missing question is ignored`; `question without key has answer null and keyFound false`; `attaches image to the question containing its y`; `single page single question`.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Implementar `detect` conforme as regras; extrair os regex como constantes nomeadas no topo do arquivo.
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: question detector`.

### Task 3: Validator

**Files:**
- Create: `src/validator.js`, `tests/validator.test.mjs`

**Interfaces:**
- Consumes: `Question`, `detect` result
- Produces: `validate(questions: Question[], keyFound: boolean) -> {issues: Issue[], ok: boolean, summary: string}`; `ok` = nenhum issue de nível `error`; códigos: `NO_QUESTIONS` (error), `EMPTY_TEXT` (error), `FEW_OPTIONS` (error, <2 alternativas), `NO_ANSWER` (sempre warning, uma por questão com `answer` null; `ok` ignora warnings, e a UI exige confirmação explícita para salvar com `NO_ANSWER`), `ANSWER_NOT_IN_OPTIONS` (error), `DUPLICATE_KEY` (error). `summary` no formato `"12 questões detectadas, 2 sem gabarito, 1 com menos de 2 alternativas"`.

- [ ] **Step 1: Write failing tests**: um por código acima; `summary` com os números do exemplo; `valid exam -> ok true, issues []`; `NO_ANSWER` quando `keyFound` é false.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Implementar `validate`.
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: validator`.

### Task 4: Storage (IndexedDB)

**Files:**
- Create: `src/storage.js`, `tests/storage.test.mjs`

**Interfaces:**
- Consumes: `Question`
- Produces (todas async; ids gerados com `crypto.randomUUID()`):
  - `openDb() -> Promise<void>` (lança `StorageUnavailableError` se IndexedDB faltar)
  - `createFolder(name: string, parentId: string|null) -> Folder`; `renameFolder(id, name)`; `moveFolder(id, newParentId)`; `listFolders() -> Folder[]`; `deleteFolder(id)` (cascata: subpastas, exams, blobs, attempts)
  - `saveExam({folderId, title, questions}, blobs: Record<string, Blob>) -> Exam`; `getExam(id)`; `listExams(folderId) -> Exam[]`; `moveExam(id, folderId)`; `renameExam(id, title)`; `deleteExam(id)`
  - `putBlob(blob: Blob) -> string`; `getBlob(id) -> Blob`
  - `saveAttempt({examId, answers, score, total, startedAt, finishedAt}) -> Attempt`; `listAttempts(examId) -> Attempt[]` (mais recente primeiro)
  - `exportAll() -> {folders, exams, attempts, blobs: Record<string, Blob>}`; `importAll(data)` (substitui tudo)
  - Tipos: `Folder={id,parentId,name}`, `Exam={id,folderId,title,createdAt,questions}`, `Attempt={id,examId,startedAt,finishedAt,answers,score,total}`. Stores: `folders`, `exams`, `blobs`, `attempts`.

- [ ] **Step 1: Write failing tests** (com `import 'fake-indexeddb/auto'`): `folder tree create/rename/move`; `saveExam then getExam round trip`; `deleteFolder cascades exams, blobs and attempts, leaving no orphans` (conferir via `exportAll`); `listAttempts newest first`; `exportAll then importAll restores state`.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Implementar com wrapper de promessas sobre `indexedDB.open('simulados', 1)`; blobs de um exam rastreados via `question.images` para a cascata.
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: indexeddb storage`.

### Task 5: PDF parser

**Files:**
- Create: `src/pdf-parser.js`
- Modify: `index.html` (criar com scripts pdf.js e JSZip, ver Task 7 para o shell completo; aqui só o necessário para testar)
- Test: manual com `tests/fixtures/` (PDFs de exemplo do usuário, quando disponíveis) via página `dev-parse.html` descartável

**Interfaces:**
- Produces: `parsePdf(file: File) -> Promise<{lines: Line[], images: ImageRef[], blobs: Record<string, Blob>, hasText: boolean}>`

Abordagem: `pdfjsLib.getDocument` → por página `getTextContent`; agrupar itens por `y` (tolerância 3 pt) e ordenar por `x` para formar `Line`; imagens via `page.getOperatorList()` procurando `OPS.paintImageXObject`/`paintJpegXObject`, desenhando o objeto em canvas → `Blob` PNG, com `y` obtido da matriz de transformação corrente. `hasText` = pelo menos 20 caracteres no total. `workerSrc` apontando para o worker no mesmo CDN/versão.

- [ ] **Step 1:** Criar `dev-parse.html` que carrega um PDF escolhido e imprime `lines` e a contagem de imagens.
- [ ] **Step 2:** Implementar `parsePdf`.
- [ ] **Step 3:** Verificar no navegador com um PDF real: linhas em ordem de leitura, imagens extraídas, `hasText` false num PDF escaneado. Ajustar tolerância de agrupamento se colunas se misturarem.
- [ ] **Step 4:** Remover `dev-parse.html`; commit `feat: pdf parser`.

### Task 6: Backup

**Files:**
- Create: `src/backup.js`, `tests/backup.test.mjs`

**Interfaces:**
- Consumes: `exportAll`, `importAll` (Task 4)
- Produces: `exportBackup() -> Promise<Blob>` (zip com `data.json` + `blobs/<id>`); `importBackup(file: File|Blob) -> Promise<{folders: number, exams: number}>`; lança erro claro se o zip não tiver `data.json` válido.

- [ ] **Step 1: Write failing tests** (JSZip instalado como devDependency para testes): `export then import restores exams and blobs`; `import rejects zip without data.json`.
- [ ] **Step 2:** Run `npm test` — Expected: FAIL.
- [ ] **Step 3:** Implementar com JSZip (injetado como parâmetro `JSZipCtor` com default `globalThis.JSZip` para testabilidade).
- [ ] **Step 4:** Run `npm test` — Expected: PASS.
- [ ] **Step 5:** Commit `feat: backup export/import`.

### Task 7: Shell do app e Biblioteca

**Files:**
- Create/Modify: `index.html`, `styles.css`, `src/app.js`, `src/views/library.js`

**Interfaces:**
- Produces: roteador por hash: `#/` biblioteca, `#/import`, `#/review`, `#/exam/<id>`, `#/result/<attemptId>`, `#/history/<examId>`; cada view exporta `mount(container: HTMLElement, params: string[]) -> void | (() => void)` (função de limpeza opcional).
- Biblioteca: árvore de pastas com criar/renomear/mover/excluir (confirmação ao excluir), lista de simulados com iniciar/histórico/renomear/mover/excluir, botões Importar PDF e Backup (exportar/importar). Se `openDb` lançar `StorageUnavailableError`, mostrar mensagem e botão de importar backup.

- [ ] **Step 1:** Montar `index.html` (pdf.js e JSZip de cdnjs com versões exatas) e `app.js`.
- [ ] **Step 2:** Implementar `library.js`.
- [ ] **Step 3:** Verificar no navegador (servir com `npx serve .`): criar `Anatomia → Cabeça`, recarregar a página e confirmar que a árvore persiste; excluir pasta pede confirmação.
- [ ] **Step 4:** Commit `feat: app shell and library`.

### Task 8: Importar e Revisar

**Files:**
- Create: `src/views/import.js`, `src/views/review.js`

**Interfaces:**
- Consumes: `parsePdf`, `detect`, `validate`, `saveExam`, `listFolders`
- Produces: estado da importação em módulo `src/views/import.js` (`setDraft(draft)`/`getDraft()` com `{title, questions, blobs, keyFound}`) lido por `review.js`.

Import: área de arrastar/escolher PDF, indicador de progresso, relatório (`summary` + lista de issues). `hasText` false → aviso de PDF provavelmente escaneado e sem continuar. Review: editar enunciado, alternativas (adicionar/remover), gabarito (select), imagens (remover/mover para outra questão), juntar com a anterior, dividir; revalidar a cada edição; escolher título e pasta; botão Salvar bloqueado enquanto houver `error`, e `NO_ANSWER` exige marcar "salvar mesmo assim".

- [ ] **Step 1:** Implementar `import.js`.
- [ ] **Step 2:** Implementar `review.js`.
- [ ] **Step 3:** Verificar no navegador com um PDF real e com um PDF sem texto (aviso, sem salvar); corrigir um erro na revisão e salvar; o simulado aparece na pasta escolhida após recarregar.
- [ ] **Step 4:** Commit `feat: import and review`.

### Task 9: Prova, Resultado e Histórico

**Files:**
- Create: `src/views/exam.js`, `src/views/result.js`, `src/views/history.js`

**Interfaces:**
- Consumes: `getExam`, `getBlob`, `score`, `saveAttempt`, `listAttempts`
- Produces: `exam.js` aceita `#/exam/<id>` e `#/exam/<id>?only=q1,q4` (refazer só erros); ao finalizar chama `saveAttempt` e navega para `#/result/<attemptId>`.

Prova: uma questão por vez, imagens (via `URL.createObjectURL`, revogadas na limpeza), alternativas sem pré-seleção, anterior/próxima, marcar para revisar, mapa de questões com respondidas/marcadas, resumo antes de finalizar avisando de não respondidas. Resultado: nota e percentual, por questão certo/errado com resposta escolhida e gabarito, filtro "só erros", botão "refazer só os erros". Histórico: lista de tentativas com data e nota.

- [ ] **Step 1:** Implementar `exam.js`.
- [ ] **Step 2:** Implementar `result.js` e `history.js`.
- [ ] **Step 3:** Verificar o fluxo completo no navegador: fazer prova com uma questão em branco (aviso), conferir nota; refazer só erros; fechar e reabrir o navegador e ver a tentativa no histórico.
- [ ] **Step 4:** Commit `feat: exam, result and history`.

### Task 10: Publicação e verificação final

**Files:**
- Create: `README.md` (como usar, limitações: só PDFs com texto, dados no navegador, faça backup)

- [ ] **Step 1:** Rodar `npm test` — Expected: todos PASS.
- [ ] **Step 2:** Verificação manual ponta a ponta no navegador: importar → revisar → salvar → prova → resultado → reabrir navegador → exportar backup → limpar dados do site → importar backup → tudo de volta.
- [ ] **Step 3:** Publicar: criar repositório no GitHub, push, habilitar Pages na branch principal (raiz). Confirmar com o usuário antes de criar o repositório e publicar.
- [ ] **Step 4:** Commit `docs: readme`.
