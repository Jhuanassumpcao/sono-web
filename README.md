# Simulados

Importe PDFs de provas e faça simulados online. O sistema detecta questões, imagens, alternativas e gabarito; você revisa e salva. Tudo fica no seu navegador (IndexedDB), sem servidor nem banco de dados.

## Como usar
1. Abra `index.html` servido por HTTP (ex.: `python -m http.server 8080` e acesse http://localhost:8080) ou pelo GitHub Pages.
2. **Importar PDF** → confira o relatório e corrija o que precisar → escolha título e pasta → **Salvar**.
3. Na **Biblioteca**, organize em pastas (ex.: Anatomia → Cabeça), inicie um simulado e veja nota, erros e histórico.

## Limitações
- Só PDFs com **texto selecionável** (PDF escaneado precisa de OCR, ainda não suportado).
- A detecção é automática, mas nenhum layout é garantido: por isso a revisão antes de salvar é obrigatória.
- Gabarito esperado no próprio PDF (`Gabarito: 1-A 2-C…` ou lista `1 - A`, uma por linha).
- **Sem login**, os dados ficam só neste navegador. Limpar os dados do site os apaga: use **Exportar backup**.
- **Com login**, eles também vão para a nuvem e aparecem em qualquer aparelho (veja abaixo).
- Uma prova em andamento não é salva se você fechar a aba antes de finalizar.

## Desenvolvimento
```bash
npm install
npm test
```

## Publicar no GitHub Pages
Suba o repositório, vá em Settings → Pages e publique a branch `main` (raiz). Não há etapa de build.

## Conta e sincronização (opcional)
Clique em **Entrar** no topo, digite seu e-mail e o código que chegar (ou clique no link do e-mail). Não há senha.
- O app continua **local primeiro**: funciona offline e sincroniza quando houver conexão.
- No primeiro login o app pergunta se envia os dados que já estão no aparelho.
- Ao entrar com **outra conta**, os dados da anterior saem do aparelho (com opção de baixar backup antes).
- Conflitos: vale a alteração mais recente de cada item. Excluir em um aparelho exclui nos outros.
- Imagens são reduzidas (até 1600 px, WebP) antes de subir. Imagens de simulados excluídos não são apagadas da nuvem.
- Os dados de cada conta são privados (RLS no Supabase); a chave `anon` em `src/config.js` é pública por desenho.

### Configurar seu próprio projeto Supabase
1. Crie um projeto em supabase.com e rode `supabase/schema.sql` no SQL Editor.
2. Authentication → URL Configuration: cadastre a URL do site e `http://localhost:8080`.
3. Authentication → Email Templates (Magic Link e Confirm signup): inclua `{{ .Token }}` no texto para o e-mail trazer o código.
4. Coloque a Project URL e a chave anon em `src/config.js`.
