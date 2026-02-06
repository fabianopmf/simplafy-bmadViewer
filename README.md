# simplafy-bmadViewer

Aplicação estática **BMAD Viewer**: hub para navegar no roadmap e documentação BMAD (capabilities, épicos, stories, sprint status). Os artefatos (YAML/MD) **não** ficam neste repositório; são injetados em tempo de deploy a partir do repositório **simplafy-saude**.

## URL em produção

- **https://simplafy.com.br/bmadviewer** (não indexada: noindex, nofollow; fora do sitemap e bloqueada em robots.txt).

## Conteúdo deste repositório

- App do viewer: `index.html`, `app.js`, `styles.css`, `parsers.js`, `assets/`.
- Em produção, o deploy monta esta pasta junto com os artefatos do simplafy-saude (ver lista abaixo) e publica tudo na VPS em `public_html/bmadviewer/`.

## Artefatos obrigatórios (copiar do simplafy-saude no deploy)

O viewer carrega estes arquivos por fetch; **todos** devem existir na pasta de deploy (origem: `simplafy-saude/_bmad-output/`):

| Origem no simplafy-saude | Uso no viewer |
|--------------------------|----------------|
| `planning-artifacts/capabilities.yaml` | Dashboard, capabilities, épicos |
| `implementation-artifacts/sprint-status.yaml` | Status do sprint, Kanban, progresso |
| `implementation-artifacts/stories/*.md` | Conteúdo das stories (sob demanda) |

**Nota:** O arquivo de sprint é **sprint-status.yaml** (não `sprint.yaml`). O script de deploy deve copiar a pasta `implementation-artifacts/` inteira (ou ao menos `sprint-status.yaml` e a pasta `stories/`) e a pasta `planning-artifacts/` (ou ao menos `capabilities.yaml`).

## Deploy

O deploy **não** é disparado por push neste repo diretamente para a VPS. O fluxo definido no plano é:

- Quando há push na **main** do **simplafy-saude**, o workflow `.github/workflows/deploy-bmadviewer.yml` (novo arquivo, não altera o pipeline existente) faz checkout deste repo, roda o script de empacotamento e publica na VPS em `public_html/bmadviewer/`.
- **Secrets necessários no simplafy-saude:** `HOSTINGER_SSH_KEY`, `HOSTINGER_HOST`, `HOSTINGER_USER` (deploy na VPS); `GH_PAT` (token com acesso de leitura a este repo, para o checkout do simplafy-bmadViewer).

### Script de empacotamento

O script `scripts/prepare-viewer-deploy.sh` monta o bundle (viewer + planning-artifacts + implementation-artifacts). Uso:

```bash
# No CI (com dois checkouts): viewer em bmad-viewer-repo, artefatos em saude/_bmad-output
./scripts/prepare-viewer-deploy.sh <out-dir> [viewer-dir] [artifacts-dir]
# Ex.: ./scripts/prepare-viewer-deploy.sh ./deploy-viewer ./bmad-viewer-repo ./saude/_bmad-output
```

Ou com variáveis de ambiente: `OUT_DIR`, `VIEWER_DIR`, `ARTIFACTS_DIR`.

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
├── planning-artifacts/           (copiado do simplafy-saude no deploy)
│   └── capabilities.yaml        ← obrigatório
└── implementation-artifacts/    (copiado do simplafy-saude no deploy)
    ├── sprint-status.yaml       ← obrigatório (arquivo de sprint; não é sprint.yaml)
    └── stories/                 ← obrigatório (todos os .md de stories)
        └── *.md
```

Este repositório contém apenas os arquivos do viewer (HTML, JS, CSS, assets); os diretórios `planning-artifacts` e `implementation-artifacts` (incluindo **sprint-status.yaml** e **stories/**) são adicionados no passo de deploy a partir do simplafy-saude.
