# Clinicsay Instruction Builder

> **Generador conversacional de instrucciones JSON para chatbots de clínicas.**
> El asesor conversa con un agente de IA que lee las notas de la clínica y genera el JSON directamente.

---

## 📥 Instalación en Windows

### 1. Descarga este repo

Descarga y descomprime el repo en tu equipo, por ejemplo en:

```
C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay
```

### 2. Instala Node.js (requerido para los scripts de validación)

El agente ejecuta scripts de Node.js para validar el JSON generado. **Necesitas Node.js instalado.**

**Recomendado: usar nvm-windows (Node Version Manager)**

#### 2.1. Instalar nvm-windows

1. Descarga el instalador desde: https://github.com/coreybutler/nvm-windows/releases
2. Busca el archivo `nvm-setup.exe` en la última release y descárgalo.
3. Ejecuta el instalador y sigue los pasos (acepta las opciones por defecto).

#### 2.2. Instalar Node.js con nvm

Abre **PowerShell** o **CMD** como Administrador y ejecuta:

```powershell
# Instalar la versión LTS recomendada de Node.js
nvm install 20.11.0

# Usar esa versión
nvm use 20.11.0

# Verificar que está instalado
node --version   # Debe mostrar v20.11.0 o similar
npm --version    # Debe mostrar 10.x.x
```

> 💡 **¿Por qué nvm-windows?** Te permite cambiar entre versiones de Node.js fácilmente. Si algún script necesita una versión específica, puedes cambiar sin reinstalar todo.

#### 2.3. Verificar la instalación

Dentro de la carpeta del repo, instala las dependencias y verifica que Node.js funciona:

```powershell
cd C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay
npm install
node scripts/validate-and-save.js --sede demo --mode tasks-only
```

Si ves un mensaje de error tipo "JSON not found" o similar, significa que Node.js está funcionando correctamente (solo falta tener un JSON generado).

Si ves "node is not recognized", reinicia PowerShell/CMD o tu equipo.

---

### 3. Instala los agentes de opencode desktop

Los agentes son las "system instructions" que le dicen a la IA cómo generar el JSON.

> **Linux/macOS:** ejecuta `bash scripts/sync-agents.sh` y reinicia opencode. ¡Listo!
> **Windows:** sigue los pasos de abajo.
>
> 💡 **No hace falta editar rutas:** los agentes localizan la raíz del repo dinámicamente (bloque "⚠️ RUTA DEL REPO" al inicio de cada prompt), en cualquier máquina y carpeta donde se descargue el repo.

**Ruta destino en Windows:**

```
%APPDATA%\opencode\agents\
```

Normalmente es:

```
C:\Users\<TuUsuario>\AppData\Roaming\opencode\agents\
```

**Para instalar:**

1. Abre el Explorador de Archivos.
2. Escribe `%APPDATA%\opencode\agents\` en la barra de direcciones (créala si no existe).
3. Copia estos dos archivos desde el repo descargado:
   - `AGENTS\builder-tasks-only.md`
   - `AGENTS\builder-full.md`

**O usando PowerShell (como Administrador):**

```powershell
New-Item -ItemType Directory -Force -Path "$env:APPDATA\opencode\agents"
Copy-Item "C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay\AGENTS\builder-tasks-only.md" "$env:APPDATA\opencode\agents\"
Copy-Item "C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay\AGENTS\builder-full.md" "$env:APPDATA\opencode\agents\"
```

Verifica en opencode desktop con el comando:
```
/list agents
```

Deberías ver `builder-full` y `builder-tasks-only`.

> 📖 **¿Problemas?** Lee `AGENTS/README.md` para más detalles.

### 4. Elige tu modo

| Modo | Tu clínica tiene... |
|---|---|
| **`builder-full`** | Agenda digital (Google Calendar, software de citas). El bot agenda citas reales. |
| **`builder-tasks-only`** | No tiene agenda digital / prefiere control humano. El bot no agenda ni consulta disponibilidad; el asesor decide si cancela, crea una tarea, hace ambas cosas o responde sin acción. |

En opencode desktop, selecciona el agente:
```
/select builder-tasks-only
```

---

## 🚀 Uso rápido

### Paso 0: Importar JSON existente desde el backend (opcional)

Si la clínica ya tiene configurado un chatbot en el backend de Clinicsay, puedes descargar automáticamente sus JSONs de `full` y `tasks-only` para usarlos como punto de partida.

1. Copia `.env.example` a `.env` y rellena `DATABASE_URL`:
   ```powershell
   copy .env.example .env
   ```
   Ejemplos incluidos:
   - Local: `postgresql://clinicsay:clinicsay@localhost:5432/clinicsay?schema=public`
   - Integration: tu URL de Aiven

2. Instala las dependencias de Node (solo la primera vez):
   ```powershell
   npm install
   ```

3. Ejecuta el script:
   ```powershell
   make fetch-sedes
   # o, sin make:
   npx tsx scripts/fetch-sedes-from-db.ts
   ```

   El comando pide confirmación antes de borrar las sedes descargadas localmente. La sede `sedes/demo/` se conserva siempre como ejemplo canónico; las demás sedes y sus carpetas `input/`/`output/` se reemplazan de forma destructiva con el contenido activo de la base de datos. Para una automatización no interactiva, revisa primero el destino y usa `CONFIRM=1` explícitamente.

El script creará automáticamente:

```
sedes\<site-slug>\input\structured-logic.full.json
sedes\<site-slug>\input\structured-logic.tasks-only.json
sedes\<site-slug>\output\
```

Solo se traen los bots activos de tipo `CHAT_BOT`. Si un bot no tiene `full` o `tasks-only` configurado, se omite ese archivo con un aviso.

> ⚠️ **El script limpia las carpetas `input/` y `output/` de cada sede procesada** antes de escribir: `input/` quedará solo con los JSONs descargados, y `output/` quedará vacío para el siguiente paso de generación. `sedes/demo/` no se modifica.

### Paso 0.1: Publicar JSONs generados en el backend

Cuando una sede tenga JSONs finales en `output/`, puedes publicarlos con:

```powershell
make push-sedes
```

El comando muestra la base de datos destino con la contraseña oculta, lista los bots y modos que se actualizarán, y pide confirmación en el CLI. Pulsar Enter cancela la operación.

Solo se publican los archivos que existan:

| Archivo en `output/` | Clave de metadata actualizada |
|---|---|
| `structured-logic.full.json` | `structuredLogicFull` |
| `structured-logic.tasks-only.json` | `structuredLogic` |

Por ejemplo, si solo existe `structured-logic.full.json`, se actualiza únicamente FULL y se conserva TASKS-ONLY en el backend. Los borradores `.draft.json` nunca se publican.

Para limitar el push a una sede:

```powershell
make push-sedes SEDE=vazquez-fisioterapia_sede-principal-cordoba
```

En automatizaciones sin terminal interactiva, primero revisa el destino y usa `CONFIRM=1` para autorizar explícitamente:

```powershell
make push-sedes SEDE=vazquez-fisioterapia_sede-principal-cordoba CONFIRM=1
```

Cada JSON se valida antes de conectar/escribir. La actualización conserva el resto de `metadata` y se ejecuta en una transacción.

### Paso 1: Prepara tus notas

Crea la carpeta para tu clínica dentro del repo:

```
C:\Users\<TuUsuario>\Documents\instrucciones-clinicsay\sedes\mi-clinica\input\
```

Coloca ahí tus archivos de notas. Puedes incluir:
- **Uno o varios archivos** `.md` (Markdown) con la información de la clínica
- **Archivos `.json`** con lógica estructurada previa (si la tienes)
- **Archivos `.txt`** con notas adicionales
- **Cualquier combinación** de los anteriores

El agente leerá **todos** los archivos de la carpeta `input/` automáticamente.

**Ejemplo:**
```
sedes\mi-clinica\input\
├── notas-principales.md   ← Notas principales
├── servicios.md           ← Info extra
└── logic-previa.json      ← JSON anterior (opcional)
```

Usa `sedes\demo\input\` como ejemplo de cómo organizar las notas.

### Paso 2: Inicia la conversación con el agente

Dile al agente:
> "Hola, quiero generar instrucciones para mi-clinica"

El agente hará:
1. **Leer** todos tus archivos de `input/` (`.md`, `.json`, `.txt`)
2. **Leer** la documentación de referencia (templates + prompts)
3. **Generar** el JSON completo paso a paso
4. **Validar** estructura y cross-references
5. **Detectar** gaps entre tus notas y el JSON
6. **Preguntarte** por datos faltantes
7. **Entregar** el JSON final validado

El agente te preguntará: **"¿Correcto? ¿Falta algo?"**

Tú apruebas o pides cambios en el chat.

### 🔄 Paso 3: Segunda pasada obligatoria (best practice)

> ⚠️ **IMPORTANTE:** Después de recibir el JSON, **siempre pídele al agente una segunda pasada** para verificar que no haya gaps entre el JSON generado y los archivos de input.

Dile explícitamente:
> "Por favor, haz una segunda pasada revisando todos los archivos de input para verificar que no haya información faltante o gaps en el JSON generado."

El agente:
1. Releerá todos los archivos de `input/`
2. Comparará contra el JSON generado
3. Detectará cualquier inconsistencia o dato faltante
4. Corregirá lo necesario y revalidará

**Nunca consideres una tarea terminada sin esta segunda verificación.**

### Paso 4: Copia el JSON generado

El JSON final estará en (el nombre incluye el modo):
```
sedes\mi-clinica\output\structured-logic.tasks-only.json   ← si trabajas en modo tasks-only
sedes\mi-clinica\output\structured-logic.full.json         ← si trabajas en modo full
```

---

## 📝 Cómo escribir tus notas

Puedes usar **uno o varios archivos** en la carpeta `input/`. Cada archivo puede tener el nombre que quieras y extensión `.md`, `.txt` o `.json`.

Usa `#` headers para organizar la información. Estas son las secciones recomendadas:

### `# Identidad`
- Nombre del bot, nombre de la clínica, tono, personalidad
- Qué puede y no puede hacer el bot
- Reglas de idioma

### `# Datos de Contacto`
- Dirección, teléfono, email, web
- Horario de apertura

### `# Reglas de Estilo`
- Reglas de saludo
- Tono y longitud de mensajes
- Política de emojis
- Reglas de detección de idioma

### `# Tratamientos y Servicios Disponibles`
- Lista de servicios/tratamientos
- Qué profesional realiza cada uno (si es específico)
- Cuáles se pueden agendar directamente
- Cuáles requieren revisión humana
- Señales/depósitos requeridos (si hay)

### `# Reglas de Agendamiento`
- Proceso de agendamiento
- Reglas de cancelación
- Pacientes nuevos vs existentes
- Manejo de emergencias

### `# Tratamientos donde No Mencionar Precio`
- Lista de tratamientos donde no se debe mencionar precio

### `# Situaciones que van a Tarea`
- Qué casos se derivan al equipo humano

### `# Datos Mínimos para Agendar`
- Datos requeridos antes de agendar

### `# Preguntas Frecuentes`
- Preguntas comunes y respuestas

---

## 🏗️ Arquitectura

```
Agente (LLM)                   Scripts (Node.js)
────────────────────────────────────────────────────
Lee archivos input/*.md          validate-and-save.js
Lee prompts/*.md               → valida schema
Genera JSON                    → checkea cross-references
Edita JSON directamente        → checkea modo
                               gap-detector.js
                               → compara notas vs JSON
                               → detecta info faltante
                               check-structure.js
                               → verifica completitud
```

**Regla:** El agente genera. Los scripts validan. Nunca al revés.

---

## 📁 Estructura del repo

```
instrucciones-clinicsay/
├── AGENTS/                          ← System instructions para opencode
│   ├── README.md                    ← Cómo instalar los agentes en Windows
│   ├── builder-full.md              ← Agente modo full
│   └── builder-tasks-only.md        ← Agente modo tasks-only
├── README.md                        ← Este archivo (manual del asesor)
├── structured-logic-standards.md    ← Estándares del dominio (referencia técnica)
├── scripts/
│   ├── prompts/                     ← Prompts modulares (7 guías)
│   │   ├── generate-identity.md
│   │   ├── generate-intents.md
│   │   ├── generate-flows.md
│   │   ├── generate-rules.md
│   │   ├── generate-templates.md
│   │   ├── generate-faq.md
│   │   ├── generate-protocols.md
│   │   └── README.md
│   ├── validate-and-save.js       ← Validador principal
│   ├── gap-detector.js            ← Detector de gaps
│   ├── check-structure.js         ← Verificador de estructura
│   ├── sync-agents.sh             ← Instala/actualiza agentes en opencode (Linux/macOS)
│   └── lib/                        ← Librerías de soporte
├── _templates/
│   ├── base-full.json              ← Template estructural full
│   └── base-tasks-only.json        ← Template estructural tasks-only
└── sedes/
    ├── demo/
    │   ├── input/
    │   │   └── *.md / *.json / *.txt ← Ejemplo de notas
    │   └── output/                 ← Archivos generados aquí
    └── <tu-clinica>/
        ├── input/
        │   └── *.md / *.json / *.txt  ← Tus notas (tú creas esto)
        └── output/
            ├── structured-logic.<modo>.json  ← Output final (agente genera esto; <modo> = tasks-only | full)
            └── gaps.<modo>.json              ← Reporte de gaps (scripts generan esto)
```

---

## ⚙️ Scripts (ejecución manual)

Normalmente el agente ejecuta estos scripts automáticamente, pero puedes correrlos manualmente si tienes Node.js instalado:

```bash
# Validar JSON y guardar como final (--mode es OBLIGATORIO)
node scripts/validate-and-save.js --sede mi-clinica --mode tasks-only

# Detectar gaps entre anotaciones y JSON (--mode es OBLIGATORIO)
node scripts/gap-detector.js --sede mi-clinica --mode tasks-only

# Verificar estructura completa (--mode es OBLIGATORIO)
node scripts/check-structure.js --sede mi-clinica --mode tasks-only
```

### Errores vs. warnings (advisory)

Desde la sincronización con el backend, el validador distingue dos niveles:

- **❌ Errores (bloqueantes):** violaciones de schema, tipos o cross-references. Impiden guardar el JSON final. Corrige y revalida.
- **⚠️ Warnings (NO bloqueantes):** notas de calidad y de modo con severidad `high | medium | low | advisory`. El JSON se guarda igualmente.

Los warnings `ADVISORY` (`mode_note`) son **notas canónicas del modo**: describen el patrón típico (ej. "en tasks-only lo común es `redirectToTask: true`") para que confirmes si tu desviación es intencional. **El validador educa, no bloquea:** cosas como `redirectToTask` en rules o `create_task` en flows de scheduling ya NO son obligatorias — el asesor decide.

Ejemplo de salida válida con warnings:

```text
[INFO] ✅ Valid structuredLogic (tasks-only mode)
[WARN] ⚠️  2 warning(s) — NO bloqueantes:
[WARN]     [MEDIUM] Flows missing responseTemplate: general_inquiry.
[WARN]     [ADVISORY] Para tu información: la herramienta create_task SIEMPRE requiere nombre...
[INFO] Quality score: 84/94
```

---

## 🔀 Full vs Tasks-Only

| Característica | Full | Tasks-Only |
|---|---|---|
| Agenda citas reales | ✅ Sí | ❌ No |
| Consulta disponibilidad | ✅ Sí | ❌ No |
| Confirma/cancela existentes | ✅ Sí | ✅ Sí |
| Crea tareas | ✅ Sí | ✅ Sí |
| Recomendado para | Clínicas con agenda digital | Clínicas sin agenda / control humano |

En `tasks-only`, `create_task` es opcional. El modo limita scheduling y disponibilidad, pero permite gestionar citas existentes. Una solicitud puede terminar en cancelación, cancelación seguida de tarea, tarea sin cancelación o respuesta informativa. Los flujos de recordatorios para confirmar, cancelar o marcar llegada no cambian.

---

## 🔄 Mantenimiento del validador (solo administrador)

Este repo es **independiente**: incluye una **réplica funcional** del validador del backend en `scripts/lib/backend-validator/`, que usan los scripts de validación (`validate-and-save.js`, `run-validation.ts`).

**Regla clave:** Solo el administrador del sistema actualiza `scripts/lib/backend-validator/`, `_templates/` y `structured-logic-standards.md`, editándolos manualmente cuando el backend cambie. Los asesores no tocan estas carpetas. No existe sincronización automática con el backend.

Tras modificar el validador, verifica que los imports siguen funcionando:

```bash
npx tsx scripts/lib/backend-validator/run-validation.ts _templates/base-full.json full
```

### Regeneración de artefactos (comandos manuales)

| Artefacto | Fuente canónica | Comando manual |
|---|---|---|
| `_templates/base-*.json` | `buildDefaultStructuredLogicForMode(mode)` en `src/domain/chat/default-structured-logic.ts` | `npx tsx -e "import {buildDefaultStructuredLogicForMode as b} from '<backend>/src/domain/chat/default-structured-logic'; import fs from 'fs'; fs.writeFileSync('_templates/base-full.json', JSON.stringify(b('full'), null, 2)); fs.writeFileSync('_templates/base-tasks-only.json', JSON.stringify(b('tasks-only'), null, 2));"` |
| `scripts/lib/schemas/structured-logic-schema.json` | `StructuredLogicJsonSchema` en `structured-logic-json-schema.ts` | `npx tsx -e "import {StructuredLogicJsonSchema as S} from './scripts/lib/backend-validator/structured-logic-json-schema'; import fs from 'fs'; fs.writeFileSync('scripts/lib/schemas/structured-logic-schema.json', JSON.stringify(S, null, 2));"` |

### Diagnóstico de leads con comportamiento inesperado

Cuando un lead presenta un comportamiento anómalo, el agente analiza el JSON de producción de la clínica con el validador local y la documentación del repo para determinar si el problema está en el **JSON de la clínica** (error de configuración). Si el JSON no explica el comportamiento, puede tratarse de un **bug del backend**: el caso se escala al administrador del sistema, que tiene acceso al código del backend.

---

## 🆘 Solución de problemas

### "No encuentro anotaciones"
El agente te explicará el formato esperado y esperará a que crees las notas.

### Errores de validación
El agente te los explicará en español. Causas comunes:
- Falta un intent requerido (ej. `scheduling_request`)
- Un flow referencia un intent que no existe en el catálogo
- Modo tasks-only usando tools de scheduling

### Warnings advisory
El agente te los presentará como sugerencias, no como errores:
- "El validador sugiere que en modo tasks-only lo típico es `redirectToTask: true`. Tu regla no lo tiene. ¿Es intencional?"
- "Tu configuración full no usa `schedule_block`. ¿Prefieres que todas las citas pasen por recepción (modo tasks-only)?"

### Gap detection
El agente preguntará cosas como:
- "Detecté que Endolift menciona 'Dr. Pablo García' en tus notas pero no en el JSON. ¿Es correcto?"
- "Hay una señal de 30€ mencionada. ¿Aplica siempre o solo para pacientes nuevos?"

---

## 📄 Licencia

Internal use only — Clinicsay project.
