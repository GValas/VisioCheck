#!/usr/bin/env bash
#
# Lance VisioCheck en mode production (frontend + backend + IA + PostgreSQL).
#
# Prérequis : Docker + Docker Compose v2, et — pour le VLM — un GPU NVIDIA
# avec le NVIDIA Container Toolkit. Sans GPU : mettre VC_VLM_ENABLED=false
# dans .env (la détection nécessite tout de même un GPU pour de bonnes perfs).
#
# Usage :
#   ./start-prod.sh            # build + démarre en arrière-plan
#   ./start-prod.sh logs       # suit les logs
#   ./start-prod.sh down       # arrête la stack
set -euo pipefail

cd "$(dirname "$0")"

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.prod.yml"

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "ERREUR : Docker n'est pas installé." >&2
    exit 1
  fi
  if ! docker compose version >/dev/null 2>&1; then
    echo "ERREUR : Docker Compose v2 est requis (docker compose)." >&2
    exit 1
  fi
}

ensure_env() {
  if [[ ! -f .env ]]; then
    echo "Aucun .env trouvé — création depuis .env.example."
    cp .env.example .env
    echo "⚠  Pensez à éditer .env (mots de passe, API_TOKEN) avant la mise en prod."
  fi
}

check_gpu() {
  if ! command -v nvidia-smi >/dev/null 2>&1; then
    echo "⚠  GPU NVIDIA non détecté. Si vous n'avez pas de GPU, mettez"
    echo "   VC_VLM_ENABLED=false dans .env pour éviter l'échec du service IA."
  fi
}

case "${1:-up}" in
  up)
    require_docker
    ensure_env
    check_gpu
    echo "Construction et démarrage de la stack…"
    $COMPOSE up -d --build
    echo
    echo "✓ VisioCheck est lancé :"
    echo "   Frontend : http://localhost:4200"
    echo "   Backend  : http://localhost:3000/health"
    echo
    echo "Logs : ./start-prod.sh logs   |   Arrêt : ./start-prod.sh down"
    ;;
  logs)
    $COMPOSE logs -f --tail=100
    ;;
  down)
    $COMPOSE down
    ;;
  *)
    echo "Usage : ./start-prod.sh [up|logs|down]" >&2
    exit 1
    ;;
esac
