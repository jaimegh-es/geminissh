#!/bin/bash
# remote-exec.sh
# Versión inteligente: Busca la sesión adecuada basada en el directorio actual.

CONFIGS_DIR="$HOME/.gemini-bridge/configs"
CURRENT_DIR=$(pwd)

# Buscar qué configuración coincide con el path actual
MATCHED_CONFIG=""
for f in "$CONFIGS_DIR"/*.json; do
    [ -e "$f" ] || continue
    LOCAL_PATH=$(grep -o '"local_path": "[^"]*' "$f" | head -1 | cut -d'"' -f4)
    if [[ "$CURRENT_DIR" == "$LOCAL_PATH"* ]]; then
        MATCHED_CONFIG="$f"
        break
    fi
done

if [ -z "$MATCHED_CONFIG" ]; then
    # Si no hay match, ejecutar localmente
    exec "$@"
fi

# Extraer datos de la config
HOST=$(grep -o '"host": "[^"]*' "$MATCHED_CONFIG" | head -1 | cut -d'"' -f4)
USER=$(grep -o '"user": "[^"]*' "$MATCHED_CONFIG" | head -1 | cut -d'"' -f4)
REMOTE_ROOT=$(grep -o '"remote_path": "[^"]*' "$MATCHED_CONFIG" | head -1 | cut -d'"' -f4)
LOCAL_ROOT=$(grep -o '"local_path": "[^"]*' "$MATCHED_CONFIG" | head -1 | cut -d'"' -f4)

# Calcular ruta remota relativa
RELATIVE_PATH="${CURRENT_DIR#$LOCAL_ROOT}"
FINAL_REMOTE_PATH="${REMOTE_ROOT}${RELATIVE_PATH}"

COMMAND="$@"

# Log intent
curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"type\":\"command\",\"cmd\":\"$COMMAND\",\"path\":\"$FINAL_REMOTE_PATH\"}" \
    http://localhost:3456/api/log > /dev/null

# Execute
OUTPUT=$(ssh -o BatchMode=yes -o ConnectTimeout=5 "$USER@$HOST" "mkdir -p \"$FINAL_REMOTE_PATH\" && cd \"$FINAL_REMOTE_PATH\" && $COMMAND" 2>&1)
EXIT_CODE=$?

# Log result via node (safely)
node -e "
const http = require('http');
const data = JSON.stringify({
    type: 'result',
    cmd: process.argv[1],
    exit_code: parseInt(process.argv[2]),
    output: process.argv[3]
});
const req = http.request({
    hostname: 'localhost', port: 3456, path: '/api/log', method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
});
req.on('error', () => {}); req.write(data); req.end();
" "$COMMAND" "$EXIT_CODE" "$OUTPUT"

echo "$OUTPUT"
exit $EXIT_CODE
