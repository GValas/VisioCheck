# Déploiement Kubernetes

Manifests pour déployer VisioCheck sur un cluster disposant d'un **nœud GPU NVIDIA**
(avec le [NVIDIA device plugin](https://github.com/NVIDIA/k8s-device-plugin)) et d'un
**ingress-nginx**.

## Prérequis

- Images construites et poussées sur un registre accessible par le cluster :
  ```bash
  docker build -f ai-service/Dockerfile  -t <registry>/visiocheck-ai:latest .
  docker build -f backend/Dockerfile     -t <registry>/visiocheck-backend:latest .
  docker build -f frontend/Dockerfile    -t <registry>/visiocheck-frontend:latest .
  docker push <registry>/visiocheck-*:latest
  ```
  Puis ajuster les champs `image:` des Deployments (ou via `kustomize edit set image`).
- Un nœud avec `nvidia.com/gpu` allouable.
- `ingress-nginx` installé ; faire pointer `visiocheck.example.com` vers l'ingress.

## Déploiement

```bash
cp deploy/k8s/secret.example.yaml deploy/k8s/secret.yaml   # renseigner les vraies valeurs
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -k deploy/k8s/
kubectl -n visiocheck get pods,svc,ingress
```

## Notes

- **GPU** : seul `ai-service` réclame un GPU (`limits: nvidia.com/gpu: 1`). Une seule
  réplique (le suivi ByteTrack est par session côté process).
- **WebSocket** : l'ingress active l'affinité de session par cookie et des timeouts
  longs pour Socket.IO.
- **Mise à l'échelle** : `frontend` (statique) et `backend` (sans état hormis la DB)
  sont scalables horizontalement ; augmenter `replicas` selon la charge.
- **Persistance** : PostgreSQL via `StatefulSet` + PVC ; cache HuggingFace via PVC
  pour éviter de retélécharger les poids du VLM.
