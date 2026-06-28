#!/usr/bin/env bash
# Génère les stubs gRPC Python à partir du contrat partagé proto/visiocheck.proto.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
PROTO_DIR="$HERE/../proto"
OUT_DIR="$HERE/visiocheck_ai"

python -m grpc_tools.protoc \
  -I "$PROTO_DIR" \
  --python_out="$OUT_DIR" \
  --grpc_python_out="$OUT_DIR" \
  --pyi_out="$OUT_DIR" \
  "$PROTO_DIR/visiocheck.proto"

# Corrige l'import absolu généré en import relatif au package.
sed -i 's/^import visiocheck_pb2/from . import visiocheck_pb2/' \
  "$OUT_DIR/visiocheck_pb2_grpc.py"

echo "Stubs générés dans $OUT_DIR"
