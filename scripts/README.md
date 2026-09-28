# scripts/ — Scripts del repo

Esta carpeta contiene los scripts que ejecuta el agente y el administrador para validar y mantener el repo.

---

## Scripts para asesores (agente)

| Script | Qué hace | Cuándo usarlo |
|---|---|---|
| `validate-and-save.js` | Valida un JSON de clínica contra el schema y las reglas del backend | Después de generar o editar un JSON, antes de entregar |
| `gap-detector.js` | Detecta inconsistencias entre el input de la clínica y el JSON generado | Después de validar, para detectar gaps de información |
| `check-structure.js` | Verifica que todas las secciones del JSON existen y tienen contenido mínimo | Después de validar, como verificación estructural |
| `check-prompt-budget.js` | Verifica el presupuesto de tamaño del prompt (8.000 chars en `additionalRules`, 45.000 chars renderizados estimados) | Antes de publicar, o cuando el prompt crece por reglas acumuladas |
| `sync-agents.sh` | Copia los agentes (`AGENTS/*.md`) al directorio de opencode | Después de editar un agente, o al instalar el repo en una máquina nueva |

### Uso rápido

```bash
# Validar un JSON de clínica
node scripts/validate-and-save.js --sede demo --mode full

# Detectar gaps
node scripts/gap-detector.js --sede demo --mode full

# Verificar estructura
node scripts/check-structure.js --sede demo --mode full

# Verificar presupuesto de prompt (gate: exit 1 si se excede)
node scripts/check-prompt-budget.js --sede demo --mode full

# Sincronizar agentes (tras editar AGENTS/*.md)
bash scripts/sync-agents.sh
```

---

## Scripts para administrador (mantenimiento)

| Script | Qué hace | Cuándo usarlo |
|---|---|---|
| `fetch-sedes-from-db.ts` | Descarga las sedes desde PostgreSQL a `sedes/` | Para actualizar las carpetas de sedes desde la DB |
| `push-sedes-to-db.ts` | Sube las sedes desde `sedes/` a PostgreSQL | Para publicar cambios en las sedes a la DB |
| `sync-backend-validator.ts` | Copia el validator exacto desde `../clinicsay-backend` a la carpeta generada | Antes de validar o publicar tras cambios del backend |

---

## Scripts internos (no ejecutar manualmente)

| Script | Propósito |
|---|---|
| `prompts/generate-*.md` | Instrucciones modulares que lee el agente para generar cada sección del JSON |
| `lib/backend-validator/` | Wrappers que cargan el validator generado desde el backend (ver `lib/README.md`) |
| `lib/schemas/` | Schemas JSON exportados |

---

## Flujo de trabajo típico del asesor

```
1. Crear notas en sedes/<nombre>/input/
2. Hablar con el agente para generar el JSON
3. node scripts/validate-and-save.js --sede <nombre> --mode full
4. node scripts/gap-detector.js --sede <nombre> --mode full
5. node scripts/check-structure.js --sede <nombre> --mode full
6. Copiar JSON a producción
```

---

## Flujo de trabajo del administrador

```
1. El backend cambia (nueva regla de validación o nueva tool)
2. npm run sync:validator                  ← copiar la fuente exacta del backend
3. Regenerar scripts/lib/schemas/structured-logic-schema.json si corresponde
4. Actualizar _templates/ si el default del backend cambió
5. Actualizar agentes (AGENTS/*.md) si hay nuevas reglas
6. bash scripts/sync-agents.sh              ← copiar agentes a opencode
7. git add -A && git commit && git push
```
