#!/usr/bin/env bash
set -Eeuo pipefail

MODEL="${1:-${OLLAMA_MODEL:-qwen2.5:1.5b}}"
OLLAMA_HOST="${OLLAMA_HOST:-127.0.0.1:11434}"

log() { printf '[ollama] %s\n' "$*"; }
fail() { printf '[ollama] ERROR: %s\n' "$*" >&2; exit 1; }

if [[ "${EUID}" -ne 0 ]]; then
  fail 'Ejecuta este script como root o con sudo.'
fi

command -v curl >/dev/null 2>&1 || fail 'curl no está instalado.'

if ! command -v ollama >/dev/null 2>&1; then
  log 'Ollama no está instalado; instalando paquete oficial…'
  curl -fsSL https://ollama.com/install.sh | sh
else
  log "Ollama ya instalado: $(ollama --version 2>/dev/null || echo desconocido)"
fi

if systemctl list-unit-files ollama.service >/dev/null 2>&1; then
  systemctl enable --now ollama.service
fi

log "Esperando API local en http://${OLLAMA_HOST}/api/tags…"
ready=0
for _ in {1..30}; do
  if curl -fsS "http://${OLLAMA_HOST}/api/tags" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 1
done
[[ "${ready}" -eq 1 ]] || fail 'La API de Ollama no respondió en 30 segundos.'

log "Descargando/verificando modelo ${MODEL}…"
ollama pull "${MODEL}"

log 'Verificando modelo instalado…'
if ! ollama list | awk 'NR > 1 {print $1}' | grep -Fxq "${MODEL}"; then
  fail "El modelo ${MODEL} no aparece en ollama list."
fi

log 'Ollama listo.'
log "Modelo: ${MODEL}"
log "API: http://${OLLAMA_HOST}"
log "Prueba: ollama run ${MODEL} \"hola\""
