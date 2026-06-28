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

echo "▶ Installation de Claude Code CLI…"
npm install -g @anthropic-ai/claude-code

# Lancement automatique de Claude en mode « toutes permissions »
# à l'ouverture d'un terminal interactif.
#   - [ -t 1 ]            : uniquement les terminaux interactifs (avec TTY)
#                          -> les commandes lancées PAR Claude (sans TTY) ne
#                             relancent donc pas Claude.
#   - CLAUDE_AUTOSTARTED  : garde-fou supplémentaire contre toute récursion.
read -r -d '' LAUNCH <<'SNIPPET' || true

# --- lancement automatique de Claude Code (mode toutes permissions) ---
if [ -z "${CLAUDE_AUTOSTARTED:-}" ] && [ -t 1 ] && command -v claude >/dev/null 2>&1; then
  export CLAUDE_AUTOSTARTED=1
  claude --dangerously-skip-permissions
fi
SNIPPET

for rc in "$HOME/.bashrc" "$HOME/.zshrc"; do
  [ -f "$rc" ] || touch "$rc"
  if ! grep -q "CLAUDE_AUTOSTARTED" "$rc"; then
    printf '%s\n' "$LAUNCH" >> "$rc"
    echo "Hook de lancement Claude ajouté à $rc"
  fi
done

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
