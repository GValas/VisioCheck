# VisioCheck — Microservice IA

Microservice Python d'inférence : **détection + suivi** (YOLO + ByteTrack) et
**description de scène** (VLM Qwen2.5-VL via vLLM). Expose un service gRPC
`Vision` (voir `../proto/visiocheck.proto`).

## Architecture interne

```
Frame (JPEG) ──► Detector (YOLO + ByteTrack) ──► EventEngine (diff d'état)
                                                      │
                                          events / counts / frame
                                                      ▼
                                          Describer (VLM, throttlé, non bloquant)
                                                      │
                              Analysis (détections + événements + description) ──►
```

- `event_engine.py` — **cœur** : logique pure de détection des entrées/sorties,
  avec debounce. Couvert par `tests/test_event_engine.py`.
- `detector.py` — wrapper Ultralytics, une instance par session (IDs de pistes isolés).
- `describer.py` — VLM ; bascule en résumé déterministe si `VC_VLM_ENABLED=false`.
- `server.py` — serveur gRPC asynchrone, orchestration et throttling.

## Développement local (sans GPU)

```bash
python -m venv .venv && source .venv/bin/activate
pip install grpcio grpcio-tools pillow pytest
./scripts/gen_proto.sh          # génère les stubs gRPC
pytest -q                       # le moteur d'événements tourne sans GPU
```

Pour lancer le serveur en mode dégradé (détection réelle nécessite torch/ultralytics ;
descriptions déterministes) :

```bash
VC_VLM_ENABLED=false python -m visiocheck_ai.server
```

## Variables d'environnement

| Variable | Défaut | Rôle |
|---|---|---|
| `VC_GRPC_PORT` | `50051` | Port d'écoute gRPC |
| `VC_DETECTOR_MODEL` | `yolo11n.pt` | Poids YOLO (Ultralytics) |
| `VC_DETECTOR_CONF` | `0.35` | Seuil de confiance détection |
| `VC_TRACKER_CFG` | `bytetrack.yaml` | Config du tracker |
| `VC_VLM_ENABLED` | `true` | Active le VLM (sinon résumé déterministe) |
| `VC_VLM_MODEL` | `Qwen/Qwen2.5-VL-3B-Instruct-AWQ` | Modèle VLM |
| `VC_AMBIENT_INTERVAL_MS` | `5000` | Intervalle des captions d'ambiance |
| `VC_VLM_MIN_INTERVAL_MS` | `700` | Intervalle min entre 2 appels VLM |
| `VC_DEVICE` | `cuda` | Périphérique d'inférence |
