# Instrucciones: Generar sección `toolOrchestration.flows`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Reglas de Agendamiento`, `# Solicitudes de Agendamiento`, `# Reprogramación y cancelación`
2. `_templates/base-<mode>.json` — usa los flows del template como base
3. `scripts/prompts/generate-intents.md` — para alinear flows con intents existentes
4. `structured-logic-standards.md` — sección "Flows y Steps"

## Reglas Obligatorias

### 1. Un flow por intent crítico
Cada intent que requiere acción del bot DEBE tener al menos un flow:
- `existing_appointment_confirmation` → flow de confirmación
- `existing_appointment_cancellation` → flow de cancelación
- `existing_appointment_inquiry` → flow de consulta (sin tools)
- `new_appointment_scheduling` → flow de agendamiento (modo dependiente)
- `general_inquiry` → flow informativo con `query_knowledge_base` disponible como fallback semántico
- `human_follow_up` → flow de tarea

### 2. Mapeo de tools por modo

**FULL MODE — Tools permitidas:**
- `resolve_patient`: Identificar/crear paciente antes de agendar
- `resolve_treatment`: Identificar tratamiento deseado
- `resolve_professional`: Identificar profesional por nombre/especialidad
- `resolve_reschedule_target`: Identificar y persistir LA cita concreta que el paciente quiere mover, con todas las pistas ya dadas (día, hora, tratamiento)
- `resolve_availability_query`: Convertir frase natural de fecha a fechas concretas
- `check_availability`: Consultar disponibilidad de horarios
- `schedule_block`: Crear cita real (requiere resolve_patient y check_availability previos)
- `cancel_for_rescheduling`: Liberar preparatoriamente la cita YA identificada, solo en flujos de reagendamiento
- `manage_schedule_block_status`: Confirmar/cancelar/marcar en camino una cita existente
- `manage_all_schedule_blocks_for_date`: Gestionar TODAS las citas de un día
- `create_task`: Crear tarea administrativa
- `lookup_patient`: Buscar paciente existente
- `query_protocol`: Consultar protocolo por ID
- `query_knowledge_base`: Buscar semánticamente en protocols, FAQ, responseTemplates y rules cuando la respuesta no está ya en contexto

**TASKS-ONLY MODE — Tools permitidas:**
- `manage_schedule_block_status` (gestionar citas existentes)
- `manage_all_schedule_blocks_for_date`
- `create_task` (principal tool para escalamiento humano)
- `lookup_patient` (solo lectura)
- `query_protocol`
- `query_knowledge_base` (fallback semántico para preguntas informativas)
- **PROHIBIDAS:** `check_availability`, `schedule_block`, `resolve_availability_query`, `cancel_for_rescheduling`, `resolve_reschedule_target`, `resolve_professional`, `resolve_treatment`

### 3. Flujos de agendamiento por modo

**Contrato semántico de citas existentes (AMBOS MODOS):**
- `existing_appointment_reschedule_inquiry` pregunta si se puede cambiar la cita; no confirma, cancela ni reserva. En **full mode DEBE declarar** `resolve_patient` -> `resolve_reschedule_target` -> `resolve_availability_query` -> `check_availability` en ese orden, para mostrar opciones concretas de LA cita que el paciente tiene en mente; en tasks-only no usa scheduling tools.
- `existing_appointment_rescheduling` solo se activa ante una aceptación explícita y, en full, usa `resolve_patient` -> `resolve_reschedule_target` -> `cancel_for_rescheduling` -> `resolve_availability_query` -> `check_availability` -> `schedule_block`. El target, su metadata y el modo efectivo de reserva son backend-owned: no los expongas ni los pidas al asesor o al LLM.
- `hasCancelledRescheduleTarget` es la alternativa de selección para la continuidad backend-owned; no requiere ni genera campos temporales como `expiresAt`.
- La no asistencia es cancelación definitiva: usa `manage_schedule_block_status`, ofrece una nueva cita y espera aceptación antes de continuar `new_appointment_scheduling`.
- Usa estados internos descriptivos para continuaciones, nunca ids de intent nuevos. Los recordatorios siguen usando sus flows actuales de confirmación y cancelación, sin cambios.
- El asesor puede añadir `create_task` o pasos custom si respeta las tools permitidas, las capacidades previas y el orden seguro; no hay combinaciones obligatorias fuera de las invariantes del backend.

**GENERAL INQUIRY — AMBOS MODOS:**
```text
Step 1: query_knowledge_base disponible.
Responder directamente si la información ya está en contexto; invocar la tool solo cuando falte la respuesta.
allowedTools: ["query_knowledge_base"]
```

**FULL MODE (patrón canónico — ver `_templates/base-full.json`):**
```
Nueva cita (new_appointment_scheduling):
  resolve_patient debe ocurrir antes de schedule_block y schedule_block requiere ["hasResolvedPatient"].
  El asesor puede resolver al paciente antes de check_availability o después de mostrar disponibilidad, siempre antes de reservar.
  ⚠️ INVARIANTE ANTI-CIRCULAR: 'required' solo consume capabilities establecidas por steps ANTERIORES; un step NUNCA requiere lo que establece su propia tool (el validador lo rechaza como error bloqueante).

Consultar un cambio (existing_appointment_reschedule_inquiry):
  resolve_patient -> resolve_reschedule_target -> resolve_availability_query -> check_availability.
  Informativa: los huecos NO autorizan a cancelar, mover ni crear la cita.

Reprogramar cita existente (existing_appointment_rescheduling, selection.requiredCapabilities: ["hasActiveAppointment"] o alternativeRequiredCapabilities: ["hasCancelledRescheduleTarget"]):
  Step 1: resolve_patient (identidad primero; puede no llamarse con un único paciente objetivo DEFAULT, pero debe estar declarado)
  Step 2: resolve_reschedule_target, required ["hasPatientTarget"] (fijar y persistir LA cita exacta antes de tocarla)
  Step 3: cancel_for_rescheduling, required ["hasResolvedRescheduleTarget"] (liberar preparatoriamente la cita YA identificada; el backend conserva el target y establece la capability de continuación)
  Step 4: resolve_availability_query (resolver nuevas fechas)
  Step 5: check_availability (buscar nuevos horarios, usando el profesional original como preferencia cuando sea posible)
  Step 6: schedule_block (solo después de disponibilidad comprobada en el turno actual; `hasShownSlots` no puede provenir de slots heredados. El backend reconcilia sesiones ACTIVE + PENDING del tratamiento capturado: reutiliza CARE_PLAN si quedan sesiones y puede autorizar STANDALONE si no queda ninguna; el LLM no elige el modo)

  Excepción para fecha y hora concretas ya presentes al inicio del turno:
  selection.requiredCapabilities incluye "hasConcreteDateTime".
  En ese caso puede omitirse resolve_availability_query y el orden es:
  resolve_patient -> resolve_reschedule_target -> cancel_for_rescheduling -> check_availability -> schedule_block.
  La identidad y el target NUNCA se omiten: son los que deciden qué cita se libera.
  No omitir resolve_availability_query si falta la fecha o la hora; check_availability nunca debe ejecutarse sin ambas. Si el horario elegido ya no esta libre, informar la perdida de disponibilidad y ofrecer alternativas reales, sin tratarla como expiracion del target.

**CONTINUIDAD TEMPORAL:** `continuous`, `short_break`, `same_period` y `recent` pueden continuar un target dentro del contexto confiable de la conversacion. `distant` inicia una conversacion nueva y descarta target, intencion operativa, slots y disponibilidad previa.
```

**TASKS-ONLY MODE:**
```
Cualquier solicitud de agendamiento:
  El asesor puede elegir: cancelación solamente; cancelación seguida de create_task; create_task sin cancelación; o respuesta informativa sin acción.
  Si combina cancelación y tarea, usa steps secuenciales: manage_schedule_block_status exitoso y después create_task.
  `create_task` no es obligatorio. No uses tools de disponibilidad, reserva o resolución de scheduling.
```

### 4. Reglas de steps
- `step`: número secuencial (1, 2, 3...)
- `tools`: array de strings (tool names)
- `parallel`: `true` solo si las tools no dependen entre sí
- `required`: array de **capability flags** que deben estar presentes para ejecutar este step. NUNCA tool names. Flags válidas: `hasResolvedTreatment`, `hasResolvedPatient`, `hasPatientTarget`, `hasResolvedProfessional`, `hasShownSlots`, `hasSelectedSlot`, `hasCreatedAppointment`, `hasCreatedTask`, `hasResolvedAvailabilityQuery`, `hasResolvedRescheduleTarget`, `hasCancelledRescheduleTarget`, `hasConcreteDateTime`. Ejemplo: `["hasResolvedPatient"]` en el step final de booking. Si no hay requirements, usar `[]`. `hasCancelledRescheduleTarget` solo indica que el backend capturó un target elegible; no contiene ni solicita metadata interna. `hasConcreteDateTime` solo significa que el paciente ya dio fecha Y hora concretas. **INVARIANTE TÉCNICO (bloqueante):** la flag solo puede CONSUMIRSE; debe haber sido establecida por tools de steps ANTERIORES (`resolve_reschedule_target`→`hasResolvedRescheduleTarget`, `cancel_for_rescheduling`→`hasCancelledRescheduleTarget`, `resolve_treatment`→`hasResolvedTreatment`, `resolve_patient`/`lookup_patient`→`hasResolvedPatient`, `resolve_professional`→`hasResolvedProfessional`, `check_availability`→`hasShownSlots`, `schedule_block`→`hasCreatedAppointment`, `create_task`→`hasCreatedTask`, `resolve_availability_query`→`hasResolvedAvailabilityQuery`). Un step que requiere lo que su propia tool establece es una dependencia circular y bloquea el flow en runtime.
- `note`: explicación para el LLM de qué hacer en este step

**Ejemplo correcto (condición en note):**
```json
{
  "step": 2,
  "tools": ["create_task"],
  "parallel": false,
  "required": [],
  "note": "Crear tarea. Condición: solo si el paciente tiene múltiples citas el mismo día o presenta una queja."
}
```

- **Dependencias críticas (patrón canónico):**
  - `check_availability` DEBE ir antes de `schedule_block`
  - `resolve_availability_query` DEBE ir antes de `check_availability`, salvo que el flow de reagendamiento declare `selection.requiredCapabilities: ["hasConcreteDateTime"]`.
  - `resolve_patient` va en un step anterior a `schedule_block` y `schedule_block` declara `required: ["hasResolvedPatient"]`. Puede ir antes o después de `check_availability`, según el asesor.

### 5. responseTemplateKey
- Usa `responseTemplateKey` como referencia denotativa a una entrada de `responseTemplates`; nunca escribas el texto del paciente en el flow.
- Es **opcional en todos los flows**, incluidos los que usan `manage_schedule_block_status`.
- Si está ausente, no es un error: el backend lo registra y la respuesta usa `patientOutcome` cuando exista o la genera la IA desde el contexto.
- Si está presente, el `mode` se define en `responseTemplates.<key>`; no añadas `responseTemplateMode` al flow ni a sus steps.
- El template es opcional y su ausencia no bloquea: se usa `patientOutcome` cuando exista o una respuesta contextual de la IA.
- Un flow informativo como `existing_appointment_reschedule_inquiry` debe usar `model`; nunca fuerces una pregunta literal genérica.
- Nunca expongas la key, el nombre del registro ni otros identificadores técnicos al paciente.

### 6. allowedTools
- **Opcional pero recomendado**
- Lista explícita de tools que el LLM puede usar en ese flow
- Si presente, debe incluir EXACTAMENTE las tools del flow, ni más ni menos

## Anti-patrones a Evitar

❌ **Tasks-only con scheduling tools**: `check_availability` o `schedule_block` en modo tasks-only → ERROR CRÍTICO
⚠️ **Flow sin steps ni mecanismo declarado**: Un flow puede tener `steps: []` y no declarar `responseTemplateKey`; la ausencia no bloquea y la IA responde desde el contexto o `patientOutcome`.
❌ **Step sin tools array**: Siempre debe ser array, incluso vacío `[]` para flows informativos
❌ **schedule_block sin resolve_patient previo**: Violación de dependencia
❌ **Texto de paciente en el flow**: `responseTemplateKey` debe ser una key denotativa, no una frase como "He movido tu cita".
❌ **parallel=true con dependencias**: Si step 2 usa resultado de step 1, parallel debe ser false
❌ **`required` con tool names**: `required` debe contener capability flags (ej: `["hasResolvedPatient"]`) o `[]`, NUNCA nombres de tools como `["create_task"]` o `["manage_schedule_block_status"]` → BLOQUEA LA EJECUCIÓN DE TOOLS

## Ejemplo de Output Correcto (FULL MODE)

```json
{
  "new_appointment_scheduling": {
    "intent": "new_appointment_scheduling",
    "description": "El paciente (o alguien en su nombre) quiere reservar una NUEVA cita. Tambien incluye 'restablecer' una cita cancelada en este mismo turno de conversacion.",
    "selection": {
      "excludedCapabilities": ["hasResolvedPatient"]
    },
    "steps": [
      {
        "step": 1,
        "tools": ["resolve_treatment", "resolve_availability_query"],
        "parallel": true,
        "required": [],
        "note": "Identificar tratamiento y traducir fechas. NO pedir datos del paciente todavia."
      },
      {
        "step": 2,
        "tools": ["check_availability"],
        "parallel": false,
        "required": ["hasResolvedTreatment"],
        "note": "Buscar horarios con treatmentId + fechas (condicion: treatment_resolved)"
      },
      {
        "step": 3,
        "tools": ["resolve_patient"],
        "parallel": false,
        "required": [],
        "note": "Solo cuando el paciente elige un slot: resolver identidad (condicion: slot_selected)"
      },
      {
        "step": 4,
        "tools": ["schedule_block"],
        "parallel": false,
        "required": ["hasResolvedPatient"],
        "note": "Agendar solo cuando el paciente elige un slot y la identidad esta resuelta (condicion: patient_resolved && slot_selected)"
      }
    ]
  },
  "confirm_existing_appointment": {
    "intent": "existing_appointment_confirmation",
    "description": "El paciente confirma asistencia a una cita YA EXISTENTE: respondiendo a un recordatorio (IS_REMINDER_REPLY=true) o teniendo una cita activa en el contexto. NO usar cuando el bot acaba de PROPONER una hora nueva para agendar: en ese caso la intención es new_appointment_scheduling (continuar el agendamiento).",
    "selection": {
      "requiredCapabilities": ["hasActiveAppointment"]
    },
    "steps": [
      {
        "step": 1,
        "tools": ["manage_schedule_block_status"],
        "parallel": false,
        "required": [],
        "note": "Marcar CONFIRMADA cada cita del día. El gate determinista de selection impide activar este flow sin cita real (nunca confirmar aire)."
      }
    ],
    "responseTemplateKey": "appointment_confirmed",
    "allowedTools": ["manage_schedule_block_status"]
  }
}
```

## GATE DETERMINISTA DEL CICLO DE VIDA DE CITAS (OBLIGATORIO)

Los flujos que ACTÚAN sobre una cita existente llevan un gate determinista. Confirmar, cancelar, marcar llegada y mantener cita requieren `selection.requiredCapabilities: ["hasActiveAppointment"]`. Reprogramar acepta una cita activa o la continuidad backend-owned `alternativeRequiredCapabilities: ["hasCancelledRescheduleTarget"]`:

| Flow | Nombre (full) | Nombre (tasks-only) |
|------|---------------|---------------------|
| Confirmar | `confirm_appointment` | `confirm_existing_appointment` |
| Reagendar | `reschedule_appointment` | `reschedule_existing_appointment` |
| Cancelar | `cancel_appointment` | `cancel_existing_appointment` |
| Llegada tarde | `on_the_way` | `mark_on_the_way` |
| Mantener cita | `keep_appointment_flow` | `keep_appointment_flow` |

```json
"selection": { "requiredCapabilities": ["hasActiveAppointment"] }
```

- **Determinista y del backend:** la capability se computa de datos (bloque futuro no cancelado o link de recordatorio), NUNCA del LLM.
- **Sin cita real ni target pendiente, el flow es inelegible por construcción:** un "sí" desnudo NUNCA produce acción ni mensaje falso ("He movido tu cita", "He cancelado tu cita", "¡Muchas gracias!", "tu cita sigue confirmada").
- **NO llevan gate** (no escriben): `reschedule_inquiry`, `cancellation_inquiry`. **NO se aplica** a flujos custom de clases (ej: Pilates — dominio distinto).
- **`existing_appointment_rescheduling` (descripción sin ambigüedad):** excluir explícitamente "el paciente elige una hora de las opciones que el bot acaba de ofrecer para una NUEVA cita" — eso es `new_appointment_scheduling` (continuar el agendamiento). Ejemplos válidos SOLO de mover cita existente: "muévela al jueves", "cámbiamela a la tarde", "adelántala una hora".
- **Fallback elegante:** cuando todos son inelegibles, el LLM responde conversacionalmente (puede usar la plantilla `no_appointments` si existe) — nunca afirma una acción que no ocurrió.
```

## Ejemplo de Output Correcto (TASKS-ONLY MODE)

```json
{
  "any_scheduling_request": {
    "intent": "new_appointment_scheduling",
    "description": "El paciente solicita agendar una nueva cita, reprogramar, o consultar disponibilidad. El bot NO agenda directamente: recopila datos y crea tarea para equipo humano.",
    "steps": [
      {
        "step": 1,
        "tools": ["create_task"],
        "parallel": false,
        "required": [],
        "note": "Recopilar nombre, apellidos, teléfono, tratamiento deseado, fechas/horarios preferidos, profesional si aplica, primera visita o paciente existente, y crear una tarea para que el equipo humano gestione el agendamiento."
      }
    ],
    "responseTemplateKey": "task_created",
    "allowedTools": ["create_task"]
  }
}
```

## REGLAS DE PACIENTE Y MENSAJES

### RP1. REGLA DE ORO: Nunca asumir datos del paciente
- El bot NUNCA usa nombre, apellido ni teléfono del contacto de Kommo (`CALLER_PHONE`, `ASSOCIATED_PATIENTS`).
- Siempre pregunta al interlocutor explícitamente antes de agendar.
- Solo si el paciente dice "para mí", "a este número" o "mi número", usar `useInterlocutorPhone=true`.

### RP2. NUNCA mostrar IDs técnicos al paciente
- En `responseTemplates`, notes, y mensajes: NUNCA incluir `blockId` (ej: `01KZH2A2K352HP14EQ04VWDY6W`).
- Usar mensajes en español natural: "Tu cita ha sido cancelada", "Tu cita ha quedado confirmada".

## FLOW SAFETY RULES (el backend RECHAZA el JSON si se viola alguna)

S1. **En full rescheduling, NEVER poner una herramienta destructiva antes de su contraparte constructiva.** En particular, `manage_schedule_block_status` (cancel definitivo) NUNCA debe estar en un paso ANTERIOR a `schedule_block`, ni en el MISMO paso (con o sin `parallel: true`). En tasks-only no existe `schedule_block`: si se configuran `manage_schedule_block_status` y `create_task` en el mismo flow, deben ser steps separados y secuenciales, con cancelación antes de tarea.

S2. **Orden de reagendamiento en full mode (patrón canónico):**
`resolve_patient` → `resolve_reschedule_target` → `cancel_for_rescheduling` → `resolve_availability_query` → `check_availability` → `schedule_block`.
Primero la identidad: con dos pacientes en el mismo teléfono, resolver la cita antes que el paciente es elegir por él. Después `resolve_reschedule_target` fija y persiste LA cita exacta — su step debe exigir `hasPatientTarget` — y solo entonces se libera con `cancel_for_rescheduling`, que conserva el target y sus sesiones y lo reutiliza en `schedule_block`. `resolve_patient` puede no llegar a llamarse en runtime cuando hay un único paciente objetivo DEFAULT, pero DEBE estar declarado. Si `selection.requiredCapabilities` incluye `hasConcreteDateTime`, `resolve_availability_query` puede omitirse y el orden queda `resolve_patient` → `resolve_reschedule_target` → `cancel_for_rescheduling` → `check_availability` → `schedule_block`: los dos primeros pasos NUNCA son opcionales, son los que deciden QUÉ cita se libera. `manage_schedule_block_status` está PROHIBIDO en este flow.

S3. Un flujo de reagendamiento (intent `existing_appointment_rescheduling`) en full mode que incluye `schedule_block` DEBE declarar las seis tools del orden canónico en `steps`, numeradas y en ese orden. Liberar una cita sin haberla resuelto puede cancelar la equivocada: con dos citas del mismo paciente el mismo día, `cancel_for_rescheduling` sin `resolve_reschedule_target` previo elige a ciegas.

S3b. `allowedTools` es una lista blanca SIN ORDEN y no puede anclar el orden seguro. En reagendamiento full mode, las tools de escritura (`cancel_for_rescheduling`, `schedule_block`) deben vivir en `steps` numeradas en el orden canónico. `manage_schedule_block_status` NO debe aparecer en este flow.

S3c. **Consulta de reagendamiento (`existing_appointment_reschedule_inquiry`) en full mode:** `resolve_patient` → `resolve_reschedule_target` → `resolve_availability_query` → `check_availability`. El foco se resuelve ANTES de consultar la agenda: el bot no puede enseñar ni prometer horarios para una cita que no ha identificado. Los huecos son informativos y NO autorizan a agendar; `cancel_for_rescheduling`, `schedule_block` y `manage_schedule_block_status` siguen prohibidos aquí.

S4. `responseTemplateKey` es una referencia denotativa opcional al registro `responseTemplates`; nunca es texto dirigido al paciente. Si falta, no es un error: se loguea y se usa `patientOutcome` cuando exista o la IA.

S5. Si un flow usa `responseTemplateKey`, la key debe ser una referencia denotativa al registro `responseTemplates`. No requiere una tool, step ni terminal step concreto; `allowedTools` sigue siendo solo una whitelist.

S6. Escribe el array `steps` en orden de ejecución: la numeración debe ser ascendente (1, 2, 3...). El rendering de respuestas es independiente de la posición del step.

S7. **Los ids de intent son LIBRES** excepto dentro de dos namespaces reservados. La clínica puede inventar `insurance_coverage_inquiry`, `parking_info`, `physio_program_followup` sin problema. Lo que está CERRADO son los prefijos `new_appointment_` y `existing_appointment_`: un id que empiece por cualquiera de ellos DEBE ser uno de los ids canónicos: `new_appointment_scheduling`, `new_appointment_inquiry`, `existing_appointment_rescheduling`, `existing_appointment_reschedule_inquiry`, `existing_appointment_confirmation`, `existing_appointment_cancellation`, `existing_appointment_cancellation_inquiry`, `existing_appointment_inquiry`, `existing_appointment_keep`, `existing_appointment_delay_notice`. Un `existing_appointment_moving` inventado PARECE reagendamiento pero no es reconocido por las reglas de seguridad ni por los guards del servidor, así que la protección se apaga en silencio.

S7b. Un flujo que CREA, MUEVE o DESTRUYE citas (usa `schedule_block`, `manage_schedule_block_status` o `manage_all_schedule_blocks_for_date`, ya sea en `steps` o en `allowedTools`) DEBE declarar un intent CANÓNICO, aunque el nombre del flow sea propio de la clínica. Ese flujo lleva semántica de seguridad y los guards necesitan clasificarlo. Un flujo con intent libre y sin tools de escritura en citas (solo `query_knowledge_base`, `create_task`, `lookup_patient`, `check_availability`, resolvers...) es válido.

S8. Un flujo cuyo intent es `existing_appointment_*` Y que usa una tool de escritura en citas DEBE declarar `"selection": { "requiredCapabilities": ["hasActiveAppointment"] }`. Sin esa puerta determinista, un "sí" desnudo puede activar el flow cuando el paciente no tiene ninguna cita, y el bot actúa sobre una cita inexistente.

## Checklist antes de entregar
- [ ] Un flow por cada intent que requiere acción
- [ ] En full mode: los flows de booking deben ejecutar `resolve_patient` antes de `schedule_block`, que requiere `hasResolvedPatient`; la posición de `resolve_patient` respecto a `check_availability` es configurable por el asesor. SIN required circulares: un step nunca requiere lo que establece su propia tool.
- [ ] En tasks-only mode: NINGUNA scheduling tool (check_availability, schedule_block, etc.)
 - [ ] `responseTemplateKey` es opcional, denotativo y, si se usa, existe en `responseTemplates`
- [ ] allowedTools incluye exactamente las tools del flow (si se usa)
- [ ] Steps ordenados con dependencias correctas
- [ ] parallel=true solo cuando steps son independientes
- [ ] Notes explicativas para cada step
- [ ] **GATE ciclo de vida:** confirm, cancel, running-late y keep requieren `selection.requiredCapabilities: ["hasActiveAppointment"]`; reschedule requiere esa capability o `alternativeRequiredCapabilities: ["hasCancelledRescheduleTarget"]`.
- [ ] `existing_appointment_rescheduling` excluye "elegir hora de opciones propuestas para cita nueva" en su descripción
 - [ ] **S1-S8 FLOW SAFETY: orden destructivo correcto, intents canónicos para flows que escriben citas y steps en orden ascendente**
- [ ] En full mode, reagendamiento y consulta de reagendamiento declaran `resolve_patient` y `resolve_reschedule_target` ANTES de liberar la cita o de consultar la agenda; el step de `resolve_reschedule_target` exige `hasPatientTarget`
