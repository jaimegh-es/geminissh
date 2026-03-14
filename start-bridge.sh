#!/bin/bash
# start-bridge.sh
# Lanza el Configurador Web del Bridge.

echo -e "\x1b[36m[Gemini Bridge]\x1b[0m Starting..."
node gemini-bridge/server.js &
BRIDGE_PID=$!

# Instrucciones en consola
echo -e "\x1b[33m--------------------------------------------------\x1b[0m"
echo -e "1. Open \x1b[4mhttp://localhost:3456\x1b[0m in your browser."
echo -e "2. Enter your Linux data and click 'Connect'."
echo -e "3. Once connected, run in another terminal:"
echo -e "   \x1b[32msource ./activate.sh\x1b[0m"
echo -e "\x1b[33m--------------------------------------------------\x1b[0m"

# Capturar señal de cierre para matar el server
trap "kill $BRIDGE_PID" EXIT
wait $BRIDGE_PID
