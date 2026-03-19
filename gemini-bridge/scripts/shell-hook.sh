# Gemini Bridge - Shell Integration
# Autor: Gemini CLI

_gemini_bridge_check_path() {
    local CONFIGS_DIR="$HOME/.gemini-bridge/configs"
    local CURRENT_DIR=$(pwd)
    
    if [[ ! -d "$CONFIGS_DIR" ]]; then return 1; fi

    # Verificar si la interceptación está activa en los ajustes globales
    local SETTINGS_FILE="$HOME/.gemini-bridge/settings.json"
    if [[ -f "$SETTINGS_FILE" ]]; then
        local ACTIVE=$(grep -o '"intercept_terminal": true' "$SETTINGS_FILE")
        if [[ -z "$ACTIVE" ]]; then return 1; fi
    else
        return 1
    fi

    for f in "$CONFIGS_DIR"/*.json; do
        [ -e "$f" ] || continue
        local LP=$(grep -o '"local_path": "[^"]*' "$f" | head -1 | cut -d'"' -f4)
        if [[ "$CURRENT_DIR" == "$LP"* ]]; then
            echo "$f"
            return 0
        fi
    done
    return 1
}

# Para Zsh (Mac)
if [ -n "$ZSH_VERSION" ]; then
    gemini-bridge-accept-line() {
        # Ignorar comandos vacíos, cd, exit o si ya es un comando de bridge
        if [[ -z "$BUFFER" || "$BUFFER" == cd* || "$BUFFER" == "exit" || "$BUFFER" == *"remote-exec.sh"* ]]; then
            zle .accept-line
            return
        fi

        if _gemini_bridge_check_path > /dev/null; then
            # Guardar el comando original
            local ORIGINAL_CMD="$BUFFER"
            # Reemplazar el buffer con la ejecución remota
            # Usamos la ruta absoluta al script
            BUFFER="/Users/dev/Documents/geminissh/gemini-bridge/scripts/remote-exec.sh $ORIGINAL_CMD"
        fi
        zle .accept-line
    }
    zle -N accept-line gemini-bridge-accept-line
    echo "🚀 Gemini Bridge: Integración Zsh activada para este terminal."
fi

# Para Bash
if [ -n "$BASH_VERSION" ]; then
    # Bash es más complejo de interceptar de forma transparente sin cambiar el buffer visualmente.
    # Una alternativa es usar alias dinámicos o un trap DEBUG (más avanzado).
    echo "⚠️  Gemini Bridge: Bash detectado. La interceptación total es más estable en Zsh (default en Mac)."
fi
