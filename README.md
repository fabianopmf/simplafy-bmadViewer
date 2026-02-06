# simplafy-bmadViewer

Aplicação estática **BMAD Viewer**: hub para navegar no roadmap e documentação BMAD (capabilities, épicos, stories, sprint status). Os artefatos (YAML/MD) **não** ficam neste repositório; são injetados em tempo de deploy a partir do repositório **simplafy-saude**.

## URL em produção

- **https://simplafy.com.br/bmadviewer** (não indexada: noindex, nofollow; fora do sitemap e bloqueada em robots.txt).

## Conteúdo deste repositório

- App do viewer: `index.html`, `app.js`, `styles.css`, `parsers.js`, `assets/`.
- Em produção, o deploy monta esta pasta junto com `planning-artifacts/` e `implementation-artifacts/` (vindos do simplafy-saude) e publica tudo na VPS em `public_html/bmadviewer/`.

## Deploy

O deploy **não** é disparado por push neste repo diretamente para a VPS. O fluxo definido no plano é:

- Quando há deploy no **simplafy-saude**, um workflow adicional (no simplafy-saude) monta o bundle (viewer deste repo + artefatos do simplafy-saude) e publica na VPS em `public_html/bmadviewer/`.
- Opcionalmente, pode existir um workflow neste repo que, ao push aqui, monte o bundle (buscando artefatos do simplafy-saude) e faça o deploy na VPS.

**Importante:** O repositório **simplafy-saude** não é alterado; todo o fluxo de “atualizar o viewer na VPS” usa um **novo** workflow (arquivo separado) no simplafy-saude ou um workflow neste repo.

## Desenvolvimento local

1. Servir a pasta do viewer e simular artefatos ao lado (ou usar symlinks para pastas locais de `planning-artifacts` e `implementation-artifacts`):

   ```bash
   cd simplafy-bmadViewer
   npx serve .
   ```

2. Para testar com path de produção (`BASE = ''`), acesse de um servidor que sirva o app em `/bmadviewer/` (ex.: proxy ou servidor na raiz com path `/bmadviewer`).

3. Para testar com path de desenvolvimento (`BASE = '../'`), coloque este diretório dentro de uma pasta que também contenha `planning-artifacts/` e `implementation-artifacts/` e sirva um nível acima:

   ```bash
   # Ex.: estrutura _bmad-output/bmad-viewer/ e _bmad-output/planning-artifacts/
   cd _bmad-output
   npx serve .
   # Abrir http://localhost:3000/bmad-viewer/
   ```

## Estrutura esperada em produção (na VPS)

```
public_html/bmadviewer/
├── index.html
├── app.js
├── styles.css
├── parsers.js
├── assets/
├── planning-artifacts/    (copiado do simplafy-saude no deploy)
│   └── capabilities.yaml
└── implementation-artifacts/
    ├── sprint-status.yaml
    └── stories/
```

Este repositório contém apenas os arquivos do viewer (HTML, JS, CSS, assets); os diretórios `planning-artifacts` e `implementation-artifacts` são adicionados no passo de deploy.
