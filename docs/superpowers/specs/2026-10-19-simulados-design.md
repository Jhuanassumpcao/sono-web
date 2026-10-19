# Sistema de Simulados a partir de PDFs — Design

Data: 2026-10-19

## Objetivo
Site público e gratuito (GitHub Pages) em que cada usuário importa PDFs de provas e o sistema os transforma em simulados online: enunciado, imagens e alternativas são mostrados, o usuário responde, e ao final vê certo/errado (gabarito vindo do próprio PDF) e a pontuação. Simulados ficam organizados em grupos e pastas (ex.: Anatomia → Cabeça → vários simulados).

## Restrições
- Sem banco de dados nem backend. Site 100% estático (HTML + ES modules, sem build).
- Cada usuário importa os próprios PDFs; os dados ficam no navegador dele.
- Persistência: ao fechar e reabrir o navegador, tudo continua lá (IndexedDB). Como o navegador pode apagar esses dados, há exportar/importar backup.
- Importador deve aceitar "qualquer PDF" com texto selecionável, validar o resultado e permitir correção antes de salvar.
- Idioma principal: português (aceitar variações comuns de formatação).

## Fora da v1
- OCR de PDFs escaneados (candidato a v1.5, Tesseract.js).
- IA opcional com chave de API do usuário para layouts difíceis.
- Pesos por questão, penalidade por erro, compartilhamento entre usuários, contas.

## Telas
1. **Biblioteca**: árvore de grupos/pastas e simulados; criar, renomear, mover, excluir.
2. **Importar PDF**: arrastar PDF → processamento → relatório de validação → tela de revisão → escolher pasta e salvar.
3. **Prova**: uma questão por vez (enunciado, imagens, alternativas), navegação, marcar para revisar. Sem resposta pré-selecionada.
4. **Resultado**: nota e percentual, certo/errado por questão com gabarito, filtro só erros, refazer só os erros.
5. **Histórico**: tentativas anteriores por simulado.

## Módulos
| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `pdf-parser` | Extrai texto com posições e imagens por página (pdf.js); associa imagens à questão mais próxima | pdf.js |
| `question-detector` | Segmenta questões (`1.`, `1)`, `Questão 1`), alternativas (`A)`, `a.`, `(A)`) e gabarito (`Gabarito: 1-C`, tabela ou lista) | saída do parser |
| `validator` | Verifica enunciado, ≥2 alternativas, gabarito válido; gera relatório com avisos | detector |
| `review-editor` | Edita enunciado, alternativas, gabarito, imagens; junta/divide questões | validator |
| `storage` | IndexedDB: pastas, simulados, imagens (blobs), tentativas | — |
| `exam-runner` / `scoring` | Executa a prova e calcula pontuação (1 ponto por acerto, percentual) | storage |
| `backup` | Exporta/importa todos os dados (JSON + imagens em zip) | storage |

Cada módulo expõe uma interface pequena e é testável isoladamente (o detector e o validator são funções puras sobre dados de texto).

## Fluxo de dados
PDF → `pdf-parser` → `question-detector` → `validator` → `review-editor` (usuário) → `storage` → `exam-runner` → tentativa salva em `storage`.

## Modelo de dados (IndexedDB)
- `folders`: `{id, parentId|null, name}`
- `exams`: `{id, folderId, title, createdAt, questions: [{id, text, images: [blobId], options: [{key, text}], answer}]}`
- `blobs`: `{id, data}`
- `attempts`: `{id, examId, startedAt, finishedAt, answers: {questionId: key}, score, total}`

## Tratamento de erros
- PDF sem texto extraível: aviso claro de que provavelmente é escaneado (OCR fora da v1).
- Questão sem gabarito ou com <2 alternativas: marcada no relatório e destacada na revisão; só salva se o usuário confirmar ou corrigir.
- IndexedDB indisponível/cheio: mensagem e oferta de exportar backup.

## Testes
- Detector e validator: testes unitários com textos de exemplo cobrindo variações de numeração, alternativas e gabarito.
- Scoring: testes unitários.
- Calibração com PDFs reais fornecidos pelo usuário.
- Verificação manual no navegador do fluxo importar → revisar → prova → resultado → reabrir navegador.

## Limites conhecidos
Nenhum detector acerta 100% dos layouts. Por isso a revisão antes de salvar é obrigatória e o relatório de validação aponta exatamente o que precisa de atenção.

## Publicação
GitHub Pages servindo a raiz do repositório (ou `/docs`), sem etapa de build.
