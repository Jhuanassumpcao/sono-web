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
- Os dados ficam só neste navegador. Limpar os dados do site os apaga: use **Exportar backup** de vez em quando.
- Uma prova em andamento não é salva se você fechar a aba antes de finalizar.

## Desenvolvimento
```bash
npm install
npm test
```

## Publicar no GitHub Pages
Suba o repositório, vá em Settings → Pages e publique a branch `main` (raiz). Não há etapa de build.
