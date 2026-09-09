#!/usr/bin/env bash
#
# sync-backend.sh — Sincroniza módulos del backend clinicsay al repo de instrucciones.
#
# Uso:
#   bash scripts/sync-backend.sh [RUTA_BACKEND] [--diff|--apply|--list|--help]
#
# Modos:
#   (sin flags)     Importa archivos del backend y muestra comparación resumida
#   --diff          Muestra el diff completo de cada archivo diferente
#   --apply         Aplica (copia) los archivos diferentes del backend a la réplica local
#   --list          Solo lista los archivos que se importarían, sin copiar
#   --help          Muestra esta ayuda
#
# Por defecto busca el backend en:
#   - /root/clinicsay-backend
#   - ../clinicsay-backend
#   - ~/clinicsay-backend
#
# Este script mantiene un mirror de solo lectura en scripts/lib/backend-source/
# y opcionalmente sincroniza la réplica funcional en scripts/lib/backend-validator/.
#
# Flujo:
#   1. Detecta o valida la ruta del backend
#   2. Copia archivos del validador a scripts/lib/backend-source/ (mirror)
#   3. Compara cada archivo con la réplica local en backend-validator/
#   4. Muestra diff y estadísticas
#   5. En modo --apply, copia los archivos diferentes tras confirmación
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Parseo de argumentos ──
MODE="compare"
BACKEND_DIR=""

for arg in "$@"; do
  case "$arg" in
    --diff)
      MODE="diff"
      ;;
    --apply)
      MODE="apply"
      ;;
    --list)
      MODE="list"
      ;;
    --help|-h)
      echo "sync-backend.sh — Sincroniza módulos del backend clinicsay"
      echo ""
      echo "Uso: bash scripts/sync-backend.sh [RUTA_BACKEND] [--diff|--apply|--list|--help]"
      echo ""
      echo "Modos:"
      echo "  (sin flags)   Importa y muestra comparación resumida"
      echo "  --diff        Muestra el diff completo de archivos diferentes"
      echo "  --apply       Aplica cambios del backend a la réplica local (tras confirmar)"
      echo "  --list        Solo lista archivos que se importarían"
      echo "  --help        Muestra esta ayuda"
      echo ""
      echo "Por defecto busca backend en:"
      echo "  /root/clinicsay-backend, ../clinicsay-backend, ~/clinicsay-backend"
      exit 0
      ;;
    -*)
      echo "⚠️  Flag desconocida: $arg. Usa --help para ver opciones."
      exit 1
      ;;
    *)
      BACKEND_DIR="$arg"
      ;;
  esac
done

# ── 1. Detectar ruta del backend ──
if [ -z "$BACKEND_DIR" ]; then
  # Auto-detectar rutas comunes
  for candidate in "/root/clinicsay-backend" "$REPO_ROOT/../clinicsay-backend" "$HOME/clinicsay-backend"; do
    if [ -d "$candidate/src/domain/chatbot-instruction-builder" ]; then
      BACKEND_DIR="$candidate"
      break
    fi
  done
fi

if [ -z "$BACKEND_DIR" ] || [ ! -d "$BACKEND_DIR/src/domain/chatbot-instruction-builder" ]; then
  echo "❌ No se encontró el backend de clinicsay."
  echo "   Buscado en:"
  echo "     - /root/clinicsay-backend"
  echo "     - $REPO_ROOT/../clinicsay-backend"
  echo "     - $HOME/clinicsay-backend"
  echo ""
  echo "   Uso: bash scripts/sync-backend.sh /ruta/al/clinicsay-backend"
  exit 1
fi

echo "📦 Backend detectado: $BACKEND_DIR"

# ── 2. Preparar carpetas ──
SOURCE_DIR="$REPO_ROOT/scripts/lib/backend-source"
VALIDATOR_DIR="$REPO_ROOT/scripts/lib/backend-validator"

mkdir -p "$SOURCE_DIR"
mkdir -p "$VALIDATOR_DIR"

# ── 3. Lista de archivos a importar y su réplica local ──
# Formato: "ruta/en/el/backend|ruta/en/backend-validator"
# La ruta de backend siempre empieza en src/ y se espeja tal cual en backend-source/.
# La ruta de réplica es relativa a backend-validator/; "-" significa "solo mirror"
# (context codebase sin réplica funcional, p. ej. tool-call-policy.ts).
# Mantener esta lista al día cuando el backend toque el módulo del chatbot:
# incluye el validador (chatbot-instruction-builder), los tipos/tools de domain/chat
# que consume (structured-logic, response-template, canonical-flow-selection, ...)
# y los ports que tipan las tool definitions.
declare -a FILE_MAP=(
  "src/domain/chatbot-instruction-builder/validator.ts|validator.ts"
  "src/domain/chatbot-instruction-builder/constants.ts|constants.ts"
  "src/domain/chatbot-instruction-builder/structured-logic-json-schema.ts|structured-logic-json-schema.ts"
  "src/domain/chatbot-instruction-builder/schema-key-extractor.ts|schema-key-extractor.ts"
  "src/domain/chatbot-instruction-builder/canonicalize-structured-logic.ts|canonicalize-structured-logic.ts"
  "src/domain/chatbot-instruction-builder/gaps.ts|gaps.ts"
  "src/domain/chatbot-instruction-builder/placeholders.ts|placeholders.ts"
  "src/domain/chatbot-instruction-builder/types.ts|types.ts"
  "src/domain/chatbot-instruction-builder/fix-commands.ts|fix-commands.ts"
  "src/domain/chatbot-instruction-builder/diff.ts|diff.ts"
  "src/domain/chatbot-instruction-builder/text-chunker.ts|text-chunker.ts"
  "src/domain/chatbot-instruction-builder/text-cleaner.ts|text-cleaner.ts"
  "src/domain/chatbot-instruction-builder/agent-tools.ts|agent-tools.ts"
  "src/domain/chatbot-instruction-builder/builder-tool-definitions.ts|builder-tool-definitions.ts"
  "src/domain/chatbot-instruction-builder/builder-tools.ts|builder-tools.ts"
  "src/domain/chatbot-instruction-builder/structured-logic-wire-format.ts|structured-logic-wire-format.ts"
  "src/domain/chatbot-instruction-builder/structured-logic-wire-schema.ts|structured-logic-wire-schema.ts"
  "src/domain/chatbot-instruction-builder/advisory/mode-advisory.ts|advisory/mode-advisory.ts"
  "src/domain/chatbot-instruction-builder/validators/basic-schema.ts|validators/basic-schema.ts"
  "src/domain/chatbot-instruction-builder/validators/cross-reference.ts|validators/cross-reference.ts"
  "src/domain/chatbot-instruction-builder/validators/domain-rules.ts|validators/domain-rules.ts"
  "src/domain/chatbot-instruction-builder/validators/flow-safety.ts|validators/flow-safety.ts"
  "src/domain/chatbot-instruction-builder/validators/flow-validation.ts|validators/flow-validation.ts"
  "src/domain/chatbot-instruction-builder/validators/structural.ts|validators/structural.ts"
  "src/domain/chat/availability/chat-bot-defaults.ts|availability/chat-bot-defaults.ts"
  "src/domain/chat/canonical-intents.ts|canonical-intents.ts"
  "src/domain/chat/structured-logic.ts|structured-logic.ts"
  "src/domain/chat/structured-logic-minimum.ts|structured-logic-minimum.ts"
  "src/domain/chat/structured-logic-skeleton.ts|structured-logic-skeleton.ts"
  "src/domain/chat/default-structured-logic.ts|default-structured-logic.ts"
  "src/domain/chat/conversation-resumption.ts|conversation-resumption.ts"
  "src/domain/chat/response-template.ts|response-template.ts"
  "src/domain/chat/canonical-flow-selection.ts|canonical-flow-selection.ts"
  "src/domain/chat/system-tool-descriptions.ts|system-tool-descriptions.ts"
  "src/domain/chat/tool-definitions-full.ts|tool-definitions-full.ts"
  "src/domain/chat/tool-definitions-tasks-only.ts|tool-definitions-tasks-only.ts"
  "src/domain/chat/tool-description-generator.ts|tool-description-generator.ts"
  "src/ports/secondary/chat/openai-conversation.port.ts|ports/secondary/chat/openai-conversation.port.ts"
  "src/domain/chat/tool-names.ts|-"
  "src/application/chat/use-cases/RunToolCycle/tool-call-policy.ts|-"
)

# ── 4. Copiar archivos del backend ──
echo ""
echo "🔄 Importando archivos del backend..."

IMPORTED=0
MISSING=0

for entry in "${FILE_MAP[@]}"; do
  file="${entry%%|*}"
  src="$BACKEND_DIR/$file"
  # Replicar estructura de carpetas bajo backend-source/
  rel_path="${file#src/}"  # quitar prefijo src/
  dest="$SOURCE_DIR/$rel_path"
  dest_dir="$(dirname "$dest")"

  if [ -f "$src" ]; then
    mkdir -p "$dest_dir"
    cp "$src" "$dest"
    IMPORTED=$((IMPORTED + 1))
  else
    echo "   ⚠️  No encontrado: $file"
    MISSING=$((MISSING + 1))
  fi
done

echo "   ✅ $IMPORTED archivos importados a scripts/lib/backend-source/"
if [ $MISSING -gt 0 ]; then
  echo "   ⚠️  $MISSING archivos no encontrados en el backend"
fi

# ── 5. Comparar con réplicas locales ──
echo ""
echo "🔍 Comparando con réplicas locales en backend-validator/..."

DIFF_COUNT=0
SAME_COUNT=0
NEW_COUNT=0

declare -a DIFF_NAMES=()
declare -a DIFF_SOURCE_FILES=()
declare -a DIFF_LOCAL_FILES=()

echo ""
printf "%-50s %s\n" "ARCHIVO" "ESTADO"
printf "%-50s %s\n" "--------------------------------------------------" "------"

# Comparar archivos que existen en ambos lados
compare_file() {
  local name="$1"
  local source_file="$2"
  local local_file="$3"

  if [ ! -f "$local_file" ]; then
    printf "%-50s %s\n" "$name" "🆕 NUEVO (no existe localmente)"
    NEW_COUNT=$((NEW_COUNT + 1))
    if [ "$MODE" = "diff" ] || [ "$MODE" = "apply" ]; then
      DIFF_NAMES+=("$name")
      DIFF_SOURCE_FILES+=("$source_file")
      DIFF_LOCAL_FILES+=("$local_file")
    fi
    return
  fi

  if diff -q "$source_file" "$local_file" > /dev/null 2>&1; then
    printf "%-50s %s\n" "$name" "✅ IGUAL"
    SAME_COUNT=$((SAME_COUNT + 1))
  else
    printf "%-50s %s\n" "$name" "🔴 DIFERENTE"
    DIFF_COUNT=$((DIFF_COUNT + 1))
    DIFF_NAMES+=("$name")
    DIFF_SOURCE_FILES+=("$source_file")
    DIFF_LOCAL_FILES+=("$local_file")
  fi
}

# Comparar cada entrada del FILE_MAP (excepto las marcadas como solo-mirror con "-").
# OJO: la réplica local lleva los imports reescritos a su estructura plana, así que
# los archivos con imports relativos al backend aparecerán como DIFERENTES aunque
# estén alineados; revisa el diff para distinguir reescritura de desfase real.
for entry in "${FILE_MAP[@]}"; do
  file="${entry%%|*}"
  replica="${entry#*|}"
  if [ "$replica" = "-" ]; then
    continue
  fi
  compare_file "$replica" \
    "$SOURCE_DIR/${file#src/}" \
    "$VALIDATOR_DIR/$replica"
done

echo ""
echo "📊 RESUMEN DE COMPARACIÓN:"
echo "   ✅ Iguales:        $SAME_COUNT"
echo "   🔴 Diferentes:     $DIFF_COUNT"
echo "   🆕 Nuevos locales: $NEW_COUNT"

# ── 6. Modo --diff: mostrar diffs completos ──
if [ "$MODE" = "diff" ] && [ ${#DIFF_NAMES[@]} -gt 0 ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "📄 DIFERENCIAS DETALLADAS (modo --diff)"
  echo "════════════════════════════════════════════════════════════"
  
  for i in "${!DIFF_NAMES[@]}"; do
    echo ""
    echo "─── ${DIFF_NAMES[$i]} ───"
    if [ -f "${DIFF_LOCAL_FILES[$i]}" ]; then
      diff -u "${DIFF_LOCAL_FILES[$i]}" "${DIFF_SOURCE_FILES[$i]}" || true
    else
      echo "   (Archivo nuevo en backend, no existe localmente)"
      echo "   Ruta: ${DIFF_SOURCE_FILES[$i]}"
    fi
    echo ""
  done
fi

# ── 7. Modo --apply: aplicar cambios ──
if [ "$MODE" = "apply" ] && [ ${#DIFF_NAMES[@]} -gt 0 ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "🔧 MODO APPLY: aplicar cambios del backend a la réplica local"
  echo "════════════════════════════════════════════════════════════"
  echo ""
  echo "Archivos a modificar:"
  for name in "${DIFF_NAMES[@]}"; do
    echo "   - $name"
  done
  echo ""
  
  if [ -t 0 ]; then
    read -p "¿Confirmas copiar estos archivos? [s/N]: " confirm
    if [[ "$confirm" =~ ^[Ss]$ ]]; then
      for i in "${!DIFF_NAMES[@]}"; do
        local_dir="$(dirname "${DIFF_LOCAL_FILES[$i]}")"
        mkdir -p "$local_dir"
        cp "${DIFF_SOURCE_FILES[$i]}" "${DIFF_LOCAL_FILES[$i]}"
        echo "   ✅ ${DIFF_NAMES[$i]} → copiado"
      done
      echo ""
      echo "🎉 Sincronización completada. Valida los cambios con:"
      echo "   npx tsx scripts/lib/backend-validator/run-validation.ts <json> <mode>"
    else
      echo "   ❌ Cancelado por el usuario."
    fi
  else
    echo "   ⚠️  Modo no interactivo detectado. Usa --apply desde una terminal interactiva."
    echo "   O copia manualmente:"
    for i in "${!DIFF_NAMES[@]}"; do
      echo "     cp ${DIFF_SOURCE_FILES[$i]} ${DIFF_LOCAL_FILES[$i]}"
    done
  fi
fi

# ── 8. Sugerencia de siguiente paso (modo compare) ──
if [ "$MODE" = "compare" ] || [ "$MODE" = "list" ]; then
  echo ""
  echo "💡 RECOMENDACIÓN:"
  echo "   Los archivos importados viven en scripts/lib/backend-source/ (mirror de solo lectura)."
  echo "   Cuando el backend evolucione, vuelve a correr este script y compara los diffs."
  echo ""
  if [ $DIFF_COUNT -gt 0 ] || [ $NEW_COUNT -gt 0 ]; then
    echo "   Próximos pasos:"
    echo "   1. Ver diffs:  bash scripts/sync-backend.sh --diff"
    echo "   2. Aplicar:    bash scripts/sync-backend.sh --apply"
    echo "   3. Revalidar:  npx tsx scripts/lib/backend-validator/run-validation.ts <json> <mode>"
  fi
  echo ""
fi
