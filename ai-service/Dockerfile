# Image du microservice d'inférence (GPU NVIDIA requis pour détection + VLM).
# Construire depuis la RACINE du dépôt : le contexte inclut proto/.
#   docker build -f ai-service/Dockerfile -t visiocheck-ai .
FROM nvidia/cuda:12.4.1-cudnn-runtime-ubuntu22.04

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3.11 python3-pip python3.11-dev \
        libgl1 libglib2.0-0 \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dépendances d'abord (cache de couche).
COPY ai-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Contrat proto partagé + code du service.
COPY proto/ /proto/
COPY ai-service/ ./

# Génère les stubs gRPC au build.
RUN python -m grpc_tools.protoc -I /proto \
        --python_out=visiocheck_ai --grpc_python_out=visiocheck_ai --pyi_out=visiocheck_ai \
        /proto/visiocheck.proto && \
    sed -i 's/^import visiocheck_pb2/from . import visiocheck_pb2/' \
        visiocheck_ai/visiocheck_pb2_grpc.py

EXPOSE 50051
CMD ["python", "-m", "visiocheck_ai.server"]
