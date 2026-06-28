# VisioCheck

Application web qui, à partir d'un flux **webcam**, reconnaît les éléments dans le
champ de vision et **décrit la scène en temps réel** — en mettant l'accent sur les
**nouveaux événements** (un objet ou une personne qui entre / sort du cadre).

100 % auto-hébergé : tous les modèles d'IA tournent dans tes propres conteneurs,
aucune image ne sort de l'infrastructure.

## Principe — deux cadences découplées

Le « temps réel » repose sur le découplage de deux traitements :

1. **Détection + suivi** à 30–60 fps (modèles légers, quelques ms/image) → overlay
   des objets quasi-instantané.
2. **Description en langage naturel (VLM)** déclenchée **uniquement sur événement**
   (objet entré/sorti) + un *caption* d'ambiance throttlé → narration fluide avec
   ~0,3–1,5 s de latence.

On ne fait jamais tourner le VLM à chaque frame : c'est ce qui rend le besoin réaliste.

## Architecture

```
frontend/ (Angular)  ──WebSocket binaire (frames ~10fps)──┐
        ▲  overlay + flux d'événements                     │
        └──────────── Socket.IO (analyses) ────────────────┤
                                                            ▼
backend/ (NestJS) ── passerelle, sessions, santé, plan de contrôle
        │  ▲
        │  └── gRPC bidirectionnel (proto/visiocheck.proto)
        ▼
ai-service/ (Python, conteneur GPU)
        ├─ Détection : YOLO11/26 + ByteTrack (Ultralytics)
        ├─ Moteur d'événements : diff d'état de scène (ENTERED / LEFT)
        └─ VLM : Qwen2.5-VL (vLLM) — description sur événement + ambiance
```

| Dossier | Stack | Rôle |
|---|---|---|
| `frontend/` | Angular 18 (standalone, signals) | Capture webcam, overlay Canvas, fil d'événements |
| `backend/` | NestJS 10, Socket.IO, @grpc/grpc-js | Passerelle temps réel, client gRPC |
| `ai-service/` | Python 3.11, gRPC, Ultralytics, vLLM | Détection, suivi, événements, description |
| `proto/` | Protocol Buffers | Contrat partagé backend ↔ IA |

## Production (Docker, GPU NVIDIA recommandé)

Un script et un override Compose dédiés à la racine :

```bash
cp .env.example .env        # ajuster mots de passe, API_TOKEN, modèles
./start-prod.sh             # build + démarre en arrière-plan
./start-prod.sh logs        # suit les logs
./start-prod.sh down        # arrête la stack
```

`start-prod.sh` combine `docker-compose.yml` + `docker-compose.prod.yml`
(redémarrage auto, lecture de `.env`, rotation des logs).

```
# frontend : http://localhost:4200
# backend  : http://localhost:3000/health
# db       : PostgreSQL (journal d'événements) sur :5432
```

> Sans GPU : mettre `VC_VLM_ENABLED=false` dans `.env`.

## Développement (Dev Container)

Le dépôt fournit un **Dev Container** (`.devcontainer/`) : conteneur d'outillage
Node 22 + Python 3.11 + PostgreSQL, sans GPU requis (VLM désactivé → descriptions
déterministes). Ouvre le dossier dans VS Code → « Reopen in Container » ; les
dépendances et les stubs gRPC sont installés automatiquement, puis on lance les
trois services avec rechargement à chaud (voir le message de fin d'installation).

> Note : un *WebContainer* StackBlitz (Node-only, en navigateur) ne peut pas
> héberger le service IA Python (CUDA) ni PostgreSQL ; le Dev Container est donc
> l'environnement adapté à cette stack polyglotte.

## API REST (backend)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/health` | État backend + IA + backend de persistance |
| `GET` | `/events/recent?limit=50` | Derniers événements/descriptions (tous flux) |
| `GET` | `/sessions/:id/events?limit=200` | Historique d'une session |
| `GET` | `/sessions` | Caméras actives (multi-flux) + métriques |
| `GET` | `/stats` | Stats persistées + métriques live (fps, latence d'inférence) |

Auth : si `API_TOKEN` est défini, les routes d'historique/sessions et la poignée
de main WebSocket exigent ce token (`Authorization: Bearer …` / `auth.token`).
Sinon, mode ouvert (développement).

Autorise la webcam dans le navigateur, clique **Démarrer**. Les boîtes englobantes
s'affichent en direct ; quand un objet entre/sort, un événement + une description
apparaissent dans le panneau de droite.

> Sans GPU, lance le service IA avec `VC_VLM_ENABLED=false` : la détection requiert
> tout de même torch/ultralytics, mais les descriptions deviennent des résumés
> textuels déterministes — utile pour valider la chaîne de bout en bout.

## Développement local (sans Docker)

```bash
# 1) Service IA
cd ai-service && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
./scripts/gen_proto.sh
python -m visiocheck_ai.server

# 2) Backend
cd backend && npm install && npm run start:dev

# 3) Frontend
cd frontend && npm install && npm start
```

## Tests

```bash
cd ai-service && pytest -q     # moteur d'événements + mode dégradé de description
cd backend && npm test         # (specs NestJS)
```

Le **moteur d'événements** (`ai-service/visiocheck_ai/event_engine.py`) est de la
logique pure, entièrement couverte par des tests unitaires déterministes : c'est le
cœur du système (détection robuste des entrées/sorties avec debounce).

## Choix des modèles

- **Détection** : `yolo11n.pt` par défaut (rapide). Passe à `yolo11x` / `RF-DETR` pour
  plus de précision, ou `YOLO-World` pour un vocabulaire ouvert (au-delà des 80 classes COCO).
- **VLM** : `Qwen2.5-VL-3B-Instruct-AWQ` par défaut (tient sur ~12 Go de VRAM).
  Monte à la variante 7B pour une meilleure qualité de description.

Tout se règle par variables d'environnement (voir `ai-service/README.md`).

## Feuille de route

- [x] Phase 0 — Scaffold monorepo (3 services + docker-compose + contrat gRPC)
- [x] Phase 1 — Transport webcam → backend → IA
- [x] Phase 2 — Détection serveur + overlay
- [x] Phase 3 — Suivi + moteur d'événements (entrées/sorties) + tests
- [x] Phase 4 — Description VLM sur événement + ambiance
- [x] Phase 5 — Persistance (PostgreSQL + API d'historique), observabilité (métriques
      fps/latence via `/stats`), résilience frontend (reconnexion + backpressure)
- [x] Phase 6a — Auth par token (REST + WS), multi-caméras (registre + `/sessions`),
      Dev Container + script de prod
- [ ] Phase 6b — WebRTC (remplacement du WebSocket binaire), déploiement Kubernetes

### Persistance & observabilité

Le backend journalise chaque événement et chaque description dans **PostgreSQL**
(table `scene_events`). Sans `DATABASE_URL`, il bascule automatiquement sur un
**tampon mémoire borné** (non durable) — pratique en dev. Les métriques temps réel
(fps, latence d'inférence, frames sautées par backpressure) sont exposées via `/stats`
et dans l'en-tête de l'interface.
