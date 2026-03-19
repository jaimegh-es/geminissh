#!/bin/bash
# remote-exec.sh
# Improved version: Handles JSON extraction and remote command execution robustly.

CONFIGS_DIR="$HOME/.gemini-bridge/configs"
CURRENT_DIR=$(pwd)

# Find matching configuration based on current path
MATCHED_CONFIG=""
for f in "$CONFIGS_DIR"/*.json; do
    [ -e "$f" ] || continue
    # Extract local_path using a more robust pattern
    LOCAL_PATH=$(grep '"local_path":' "$f" | sed -E 's/.*"local_path": "(.*)".*/\1/')
    if [[ "$CURRENT_DIR" == "$LOCAL_PATH"* ]]; then
        MATCHED_CONFIG="$f"
        break
    fi
done

if [ -z "$MATCHED_CONFIG" ]; then
    # No match found, execute locally
    eval "$@"
    exit $?
fi

# Extract session data
HOST=$(grep '"host":' "$MATCHED_CONFIG" | sed -E 's/.*"host": "(.*)".*/\1/')
USER=$(grep '"user":' "$MATCHED_CONFIG" | sed -E 's/.*"user": "(.*)".*/\1/')
REMOTE_ROOT=$(grep '"remote_path":' "$MATCHED_CONFIG" | sed -E 's/.*"remote_path": "(.*)".*/\1/')
LOCAL_ROOT=$(grep '"local_path":' "$MATCHED_CONFIG" | sed -E 's/.*"local_path": "(.*)".*/\1/')

# Safety check: If any vital info is missing, fallback to local
if [[ -z "$HOST" || -z "$USER" ]]; then
    eval "$@"
    exit $?
fi

# Calculate relative remote path
RELATIVE_PATH="${CURRENT_DIR#$LOCAL_ROOT}"
FINAL_REMOTE_PATH="${REMOTE_ROOT}${RELATIVE_PATH}"

# Combine all arguments into the final command
COMMAND="$*"

# Log the intent to the bridge server
curl -s -X POST -H "Content-Type: application/json" \
    -d "{\"type\":\"command\",\"cmd\":\"$COMMAND\",\"path\":\"$FINAL_REMOTE_PATH\"}" \
    http://localhost:3456/api/log > /dev/null

# Execute via SSH with proper quoting for the remote shell
# We use mkdir -p to ensure the directory exists on the remote before CDing
OUTPUT=$(ssh -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$USER@$HOST" "mkdir -p \"$FINAL_REMOTE_PATH\" && cd \"$FINAL_REMOTE_PATH\" && $COMMAND" 2>&1)
EXIT_CODE=$?

# Log the result back to the UI
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
