# Instrucciones: Generar sección `rules`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Reglas de Agendamiento`, `# Situaciones que van a Tarea`, `# Tratamientos donde No Mencionar Precio`
2. `structured-logic-standards.md` — sección "Rules are Filters, Never Executors"
3. Los intents ya generados — cada rule DEBE referenciar un intent existente

## Reglas Obligatorias

### 0. Schema compliance — propiedades prohibidas
- **NO generar `products` ni `shipping` como propiedades top-level.** Fueron eliminados del schema del backend. La información de productos, envíos, precios de catálogo, métodos de pago, etc. debe ir en:
  - `responseTemplates` (respuestas predefinidas con precios)
  - `faq` (preguntas frecuentes sobre productos/envíos)
  - `protocols` (guías de tratamiento que mencionen productos)
  - `rules` o `intents` (reglas de negocio sobre productos)

### 1. Regla por intent
Cada intent del catálogo DEBE tener al menos una rule asociada. El array `rules` NUNCA puede estar vacío.

### 2. action SOLO "allow" o "block"
- `"allow"`: El bot procede con el flow asociado al intent
- `"block"`: El bot rechaza la solicitud sin ejecutar el flow
- **NUNCA** usar otras acciones (create_task, redirect, etc. en rules)

### 3. Estructura de cada rule
```json
{
  "id": "identificador_unico_snake_case",
  "intent": "nombre_del_intent",
  "description": "Descripción semántica de CUÁNDO aplica esta regla",
  "action": "allow|block",
  "conditionLogic": null,
  "conditions": null,
  "reason": null,
  "message": null,
  "protocolId": null,
  "requiredFields": null,
  "note": null,
  "priority": null,
  "hidePrice": null,
  "redirectToTask": null,
  "informOnly": null
}
```

### 4. Descripción semántica
Describe en lenguaje natural CUÁNDO se activa esta regla:
- ❌ MAL: "El paciente dice 'cancelar'"
- ✅ BIEN: "El paciente comunica que no podrá asistir a una cita ya reservada y solicita anularla"

### 5. Rules especiales por modo y contexto

**Taxonomía canónica en rules (CRÍTICO):**
Las rules DEBEN usar los intents canónicos exactos. Si una rule referencia un intent bajo namespace reservado (`new_appointment_*` o `existing_appointment_*`) que no es canónico, el backend RECHAZA el JSON. Los intents canónicos son:

- `new_appointment_scheduling`, `new_appointment_inquiry`
- `existing_appointment_rescheduling`, `existing_appointment_reschedule_inquiry`
- `existing_appointment_confirmation`, `existing_appointment_cancellation`
- `existing_appointment_cancellation_inquiry`, `existing_appointment_inquiry`
- `existing_appointment_keep`, `existing_appointment_delay_notice`

**Ejemplo:** una rule con `intent: "appointment_cancellation"` es RECHAZADA porque no es canónico. Debe ser `intent: "existing_appointment_cancellation"`.

**Tasks-only mode:**
- `new_appointment_scheduling`: `action: "allow"`, `redirectToTask: true` (patrón típico — **NO obligatorio**). Si la clínica prefiere que el bot responda de forma informativa sin crear tarea, omítelo a propósito: el validador mostrará una nota **advisory** (no bloqueante) para confirmar que la desviación es intencional.
- El asesor puede configurar cancelación solamente, cancelación seguida de tarea, tarea sin cancelación o respuesta informativa sin acción. Si configura cancelación + tarea, el flow debe ejecutar `manage_schedule_block_status` y, solo tras éxito, `create_task` en un step posterior.
- Tasks-only nunca usa scheduling, disponibilidad ni `cancel_for_rescheduling`.

**Full mode:**
- `new_appointment_scheduling`: `action: "allow"`, `redirectToTask: null` (el bot agenda directamente). **NO** usar `redirectToTask: true` en full mode: el backend lo detectaría como advisory (nota de modo) porque en full el bot agenda directamente.

**Contrato de intención para cancelación y reagendamiento:**
- Una consulta (`existing_appointment_reschedule_inquiry`) no confirma cambios ni cancela, pero en **full mode DEBE poder consultar disponibilidad real** (`resolve_availability_query` + `check_availability`) para mostrar opciones al paciente. Sin estas tools el flujo no tiene herramientas y el bot entra en bucle prometiendo buscar.
- Una aceptación explícita usa `existing_appointment_rescheduling`; en full el flow debe respetar `resolve_patient` -> `resolve_reschedule_target` -> `cancel_for_rescheduling` -> `resolve_availability_query` -> `check_availability` -> `schedule_block` (con la excepción documentada de `hasConcreteDateTime`).
- La no asistencia es `existing_appointment_cancellation` con `manage_schedule_block_status`. Una nueva cita posterior es `new_appointment_scheduling` y espera aceptación después de cancelar.
- Los estados internos verbose no son intents. Los flows pueden incluir `create_task` o pasos custom si el asesor lo decide y no rompe las invariantes del backend. Las respuestas a recordatorios de confirmación y cancelación no cambian.

**REGLA DE ORO DEL PACIENTE:**
- El bot NUNCA asume nombre, apellido ni teléfono del contacto de Kommo (`CALLER_PHONE`, `ASSOCIATED_PATIENTS`).
- Siempre pregunta al interlocutor explícitamente antes de agendar.
- Solo si el paciente dice "para mí", "a este número" o "mi número", usar `useInterlocutorPhone=true`.
- En `new_appointment_scheduling`, agregar a `note`: "SIEMPRE pedir nombre, apellido y telefono al interlocutor antes de agendar; nunca asumir datos de Kommo."

**Reglas de negocio de los archivos de input:**
Si las los archivos de input mencionan restricciones específicas, CREA rules con `conditions`:
- Ejemplo: "No agendar los viernes" → rule con `conditions: [{ field: "day_of_week", operator: "not_in", value: ["friday"] }]`
- Ejemplo: "Pacientes nuevos solo valoración" → rule con `conditions` que verifique tipo de paciente
- Ejemplo: "Menores de edad → tarea" → rule con `conditions` que verifique edad

### 6. conditions (opcional pero potente)
Solo usar si las los archivos de input tienen reglas explícitas:
```json
{
  "field": "day_of_week",
  "operator": "not_in",
  "value": ["friday"],
  "negated": null,
  "note": "La clínica no agenda citas los viernes"
}
```
Operadores permitidos: `"equals"`, `"in"`, `"not_in"`, `"gt"`, `"lt"`, `"gte"`, `"lte"`, `"contains"`, `"exists"`

### 7. Campos opcionales
- `hidePrice`: `true` si el intent es de un tratamiento donde NO se menciona precio (según los archivos de input)
- `priority`: Opcional. Número entero ≥ 0, o `null`. Número mayor = mayor prioridad (para ordenar evaluación). Valor por defecto: `0` o `null`.
- `note`: Explicación interna para el asesor

## Anti-patrones a Evitar

❌ **Array vacío**: `rules: []` → ROMPE el sistema. Mínimo 1 rule por intent.
❌ **Info fragmentada**: La información de precios, catálogo, reglas debe ir en `protocols` y `faq`, no solo en `rules`. El bot usa `query_knowledge_base` para buscar en esas secciones. Si la info solo está en `rules`, el bot no la encontrará para responder preguntas informativas.
❌ **Action inválido**: `"create_task"`, `"redirect"`, `"message"` en action
❌ **Rule sin description**: Cada rule DEBE tener description semántica
❌ **Rule con intent inexistente**: Si `intent: "foo"`, `"foo"` debe estar en el catálogo
❌ **Lógica de negocio en rules**: No pongas "crear tarea" en una rule. Eso va en el flow.
❌ **Ignorar restricciones de los archivos de input**: Si dice "no los viernes", créale una rule

## Ejemplo de Output Correcto

```json
[
  {
    "id": "ask_about_existing_appointment",
    "intent": "existing_appointment_inquiry",
    "description": "El paciente consulta información sobre citas que ya tiene reservadas, como horarios, fechas o tratamientos programados.",
    "action": "allow",
    "priority": 0,
    "note": "El backend inyecta las citas del paciente asociado al número en el system prompt (ASSOCIATED_PATIENTS). Si quien escribe da un nombre distinto o el número no coincide, el bot identifica la ficha con lookup_patient antes de responder; nunca afirma que no existe sin haberla buscado."
  },
  {
    "id": "confirm_existing_appointment",
    "intent": "existing_appointment_confirmation",
    "description": "El paciente confirma asistencia a una cita existente con un afirmativo breve o respondiendo a un recordatorio.",
    "action": "allow",
    "priority": 0,
     "note": "GUARDA DE EXISTENCIA: marcar CONFIRMADA solo si existe una cita activa en el contexto ASSOCIATED_PATIENTS o es respuesta a un recordatorio (IS_REMINDER_REPLY). Si el paciente responde afirmativo a una fecha/hora PROPUESTA por el bot para la que NO existe cita activa, NO marcar CONFIRMADA: continuar el agendamiento con new_appointment_scheduling (resolve_patient y schedule_block). El gate determinista de selection.requiredCapabilities=[hasActiveAppointment] en el flow impide activarlo sin cita real. Una reprogramacion pendiente se continua con su target backend-owned y no se convierte en confirmacion."
  },
  {
    "id": "cancel_existing_appointment",
    "intent": "existing_appointment_cancellation",
    "description": "El paciente solicita cancelar una o más citas existentes, o responde a un recordatorio indicando que no asistirá.",
    "action": "allow",
    "priority": 0,
    "note": "Permitir continuar para ejecutar el flow de cancelación."
  },
  {
    "id": "new_appointment_scheduling",
    "intent": "new_appointment_scheduling",
    "description": "El paciente solicita una nueva cita, reprogramar una cita existente, o consultar disponibilidad.",
    "action": "allow",
    "priority": 0,
    "redirectToTask": false,
    "note": "En full mode, el bot agenda directamente. En tasks-only, el patrón típico es redirectToTask: true (no obligatorio; su ausencia solo genera una nota advisory)."
  },
  {
    "id": "endolift_no_fridays",
    "intent": "new_appointment_scheduling",
    "description": "El paciente solicita agendar Endolift. Esta regla aplica restricciones específicas del tratamiento.",
    "action": "block",
    "priority": 0,
    "conditions": [
      {
        "field": "treatment_name",
        "operator": "equals",
        "value": "endolift",
        "note": "Endolift tiene restricciones especiales"
      }
    ],
    "reason": "Endolift requiere valoración médica previa con el Dr. Pablo García y señal de 30€",
    "note": "Si el paciente solicita Endolift, redirigir a tarea o valoración"
  }
]
```

## Checklist antes de entregar
- [ ] Al menos 1 rule por cada intent del catálogo
- [ ] NINGUNA rule con action diferente de "allow" o "block"
- [ ] Cada rule tiene `description` semántica
- [ ] Cada `intent` referenciado existe en el catálogo
- [ ] En tasks-only: `new_appointment_scheduling` tiene `redirectToTask: true` (patrón típico; si la clínica prefiere respuesta informativa sin tarea, omitirlo a propósito y confirmar que la nota advisory es esperada)
- [ ] Reglas de negocio de los archivos de input convertidas a rules con conditions si aplica
- [ ] `hidePrice: true` para intents de tratamientos donde no se menciona precio
- [ ] **`priority` es un número entero ≥ 0 o `null`** (el backend acepta ambos; por defecto `0`)
- [ ] Array `rules` no está vacío
