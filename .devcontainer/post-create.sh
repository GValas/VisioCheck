#!/usr/bin/env bash
# Initialise l'environnement de développement après création du Dev Container.
set -euo pipefail

echo "▶ Installation des dépendances backend (NestJS)…"
( cd backend && npm install )

echo "▶ Installation des dépendances frontend (Angular)…"
( cd frontend && npm install )

echo "▶ Préparation du service IA (venv + stubs gRPC)…"
cd ai-service
python -m venv .venv
# Jeu minimal pour faire tourner les tests + générer les stubs sans GPU.
# Pour la détection réelle : .venv/bin/pip install -r requirements.txt
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet grpcio grpcio-tools pillow pytest
./scripts/gen_proto.sh
cd ..

cat <<'EOF'

✓ Dev Container prêt.

Lancer les services (3 terminaux) :
  1) IA      : cd ai-service && VC_VLM_ENABLED=false .venv/bin/python -m visiocheck_ai.server
  2) Backend : cd backend && npm run start:dev
  3) Front   : cd frontend && npm start

Tests :
  - ai-service : cd ai-service && .venv/bin/pytest -q
  - backend    : cd backend && npm test

Note : sans GPU, le VLM est désactivé (descriptions déterministes) et la
détection réelle nécessite l'installation complète de requirements.txt.
EOF
