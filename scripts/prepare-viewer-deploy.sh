#!/usr/bin/env bash
# Monta o bundle de deploy do BMAD Viewer: app do viewer + planning-artifacts + implementation-artifacts.
# Uso (no CI, com dois checkouts):
#   VIEWER_DIR=/path/to/simplafy-bmadViewer ARTIFACTS_DIR=/path/to/simplafy-saude/_bmad-output OUT_DIR=./deploy-viewer ./scripts/prepare-viewer-deploy.sh
# Ou: ./scripts/prepare-viewer-deploy.sh <out-dir> [viewer-dir] [artifacts-dir]
set -euo pipefail

OUT_DIR="${OUT_DIR:-}"
VIEWER_DIR="${VIEWER_DIR:-}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-}"

if [[ $# -ge 1 ]]; then
  OUT_DIR="${1:-}"
  VIEWER_DIR="${2:-$VIEWER_DIR}"
  ARTIFACTS_DIR="${3:-$ARTIFACTS_DIR}"
fi

if [[ -z "$OUT_DIR" ]]; then
  echo "Uso: OUT_DIR=<dir> [VIEWER_DIR=<viewer>] [ARTIFACTS_DIR=<_bmad-output>] $0"
  echo "  ou: $0 <out-dir> [viewer-dir] [artifacts-dir]"
  exit 1
fi

# Defaults: viewer = diretório do script (repo simplafy-bmadViewer); artifacts = _bmad-output relativo ou env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIEWER_DIR="${VIEWER_DIR:-$(cd "$SCRIPT_DIR/.." && pwd)}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-}"

if [[ -z "$ARTIFACTS_DIR" ]] || [[ ! -d "$ARTIFACTS_DIR" ]]; then
  echo "Erro: ARTIFACTS_DIR deve apontar para _bmad-output do simplafy-saude (contém planning-artifacts e implementation-artifacts)."
  exit 1
fi

mkdir -p "$OUT_DIR"

# Viewer app (só o necessário para rodar)
for f in index.html app.js styles.css parsers.js; do
  if [[ -f "$VIEWER_DIR/$f" ]]; then
    cp "$VIEWER_DIR/$f" "$OUT_DIR/"
  fi
done
if [[ -d "$VIEWER_DIR/assets" ]]; then
  cp -r "$VIEWER_DIR/assets" "$OUT_DIR/"
fi

# Artefatos obrigatórios: capabilities.yaml, sprint-status.yaml, stories/
if [[ ! -f "$ARTIFACTS_DIR/planning-artifacts/capabilities.yaml" ]]; then
  echo "Aviso: $ARTIFACTS_DIR/planning-artifacts/capabilities.yaml não encontrado."
fi
if [[ ! -f "$ARTIFACTS_DIR/implementation-artifacts/sprint-status.yaml" ]]; then
  echo "Aviso: $ARTIFACTS_DIR/implementation-artifacts/sprint-status.yaml não encontrado."
fi

if [[ -d "$ARTIFACTS_DIR/planning-artifacts" ]]; then
  cp -r "$ARTIFACTS_DIR/planning-artifacts" "$OUT_DIR/"
else
  mkdir -p "$OUT_DIR/planning-artifacts"
fi
if [[ -d "$ARTIFACTS_DIR/implementation-artifacts" ]]; then
  cp -r "$ARTIFACTS_DIR/implementation-artifacts" "$OUT_DIR/"
else
  mkdir -p "$OUT_DIR/implementation-artifacts"
  mkdir -p "$OUT_DIR/implementation-artifacts/stories"
fi

# Garantir que os obrigatórios existem
[[ -f "$OUT_DIR/planning-artifacts/capabilities.yaml" ]] || { echo "Erro: capabilities.yaml não encontrado em $ARTIFACTS_DIR/planning-artifacts/"; exit 1; }
[[ -f "$OUT_DIR/implementation-artifacts/sprint-status.yaml" ]] || { echo "Erro: sprint-status.yaml não encontrado em $ARTIFACTS_DIR/implementation-artifacts/"; exit 1; }

echo "Bundle montado em $OUT_DIR: viewer + planning-artifacts + implementation-artifacts (capabilities.yaml, sprint-status.yaml, stories/)."
