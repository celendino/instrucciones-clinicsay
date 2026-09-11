# Instrucciones: Generar sección `intents`

## Qué debes leer antes de empezar
1. `todos los archivos en sedes/<nombre>/input/` — busca `# Tratamientos y Servicios Disponibles`, `# Reglas de Agendamiento`, `# Situaciones que van a Tarea`
2. `_templates/base-<mode>.json` — usa los baseline intents como base
3. `structured-logic-standards.md` — sección "Intent Catalog" y "Baseline Intents"
4. `scripts/prompts/generate-flows.md` — para alinear intents con flows

## Reglas Obligatorias

### 1. Baseline Intents (SIEMPRE presentes)
Crea exactamente estos 12 intents canónicos como mínimo (copia los del template base):

| ID | Descripción |
|---|---|
| `existing_appointment_confirmation` | El paciente confirma asistencia a una cita YA EXISTENTE: respondiendo a un recordatorio (IS_REMINDER_REPLY=true) o teniendo una cita activa en el contexto. NO usar cuando el bot acaba de PROPONER una hora nueva para agendar: en ese caso la intención es `new_appointment_scheduling` (continuar el agendamiento). |
| `existing_appointment_cancellation` | El paciente cancela definitivamente una cita existente o indica que no podrá asistir; no implica reagendar. |
| `existing_appointment_inquiry` | El paciente pregunta por citas que ya tiene reservadas (horarios, fechas, tratamientos). Las del titular del número están en el contexto; para otra persona o un número distinto el bot busca la ficha con `lookup_patient`. |
| `new_appointment_scheduling` | El paciente quiere reservar una NUEVA cita o consultar disponibilidad. |
| `general_inquiry` | Preguntas generales sobre la clínica: horarios, ubicación, contacto, precios fijos, servicios. |
| `human_follow_up` | Solicitudes que requieren seguimiento humano y no encajan en los intents anteriores. |
| `farewell` | El paciente se despide, agradece o cierra la conversación de forma amable. |
| `existing_appointment_rescheduling` | El paciente quiere MOVER una cita YA AGENDADA a otra fecha u hora. NO usar cuando el paciente elige una hora de las opciones que el bot acaba de ofrecer para una NUEVA cita (eso es `new_appointment_scheduling`, continuar el agendamiento). Ejemplos válidos SOLO de mover cita existente: "muévela al jueves", "cámbiamela a la tarde", "adelántala una hora". |
| `existing_appointment_delay_notice` | El paciente avisa que llegará tarde a una cita confirmada. |
| `existing_appointment_reschedule_inquiry` | El paciente pregunta si puede cambiar una cita existente, o dice CUANDO le vendria bien sin haber visto todavia ningun hueco concreto. Proponer un dia o una franja es parte de la consulta: dice donde mirar, no que se confirme el cambio. El intent pasa a `existing_appointment_rescheduling` cuando el paciente ELIGE uno de los huecos que ya se le enseñaron. En full mode este flujo DEBE poder consultar disponibilidad real (`resolve_availability_query` + `check_availability`). |
| `existing_appointment_cancellation_inquiry` | El paciente consulta sobre cancelación o pregunta qué pasaría si no puede asistir, sin ordenar la cancelación directamente. |
| `existing_appointment_keep` | El paciente indica que quiere mantener la cita tal como está. |

### 3. Intents por servicio
Por cada servicio/tratamiento mencionado en `# Tratamientos y Servicios Disponibles`:
- Crea intent `${servicio}_inquiry` donde `servicio` es el nombre en snake_case inglés
- La descripción debe ser SEMÁNTICA (describir QUÉ quiere el paciente y CUÁNDO aplica)
- Si el servicio tiene profesional asignado, menciónalo en la descripción
- Si el servicio tiene restricciones (señal, solo valoración, no pacientes nuevos), menciónalas

### 4. Ejemplos
Incluye 2-3 ejemplos realistas por intent. Los ejemplos son frases que un paciente real enviaría por WhatsApp.

### 5. IDs
- Usa `snake_case` en inglés para los IDs
- Ejemplo: "Valoración de Endolift" → `endolift_evaluation_inquiry`
- Ejemplo: "Limpieza facial" → `facial_cleansing_inquiry`

### 6. Descripciones semánticas
- Describe el OBJETIVO del paciente, no keywords
- Menciona contexto relevante (profesional, restricciones, requisitos)
- Usa español natural

## Anti-patrones a Evitar

❌ **Keyword salad**: "El paciente dice 'quiero cita', 'agendar', 'reservar'" → MAL
✅ **Semántica**: "El paciente quiere reservar una NUEVA cita o consultar disponibilidad" → BIEN

❌ **Genérico**: "El paciente pregunta por endolift" → MAL
✅ **Contextual**: "El paciente pregunta por Endolift, un tratamiento exclusivo del Dr. Pablo García que requiere señal de reserva de 30€" → BIEN

❌ **Omitir profesionales**: Si los archivos de input dicen "Endolift con Dr. Pablo García", el intent DEBE mencionarlo

❌ **Omitir restricciones**: Si hay "solo mañanas", "requiere señal", "no pacientes nuevos", incluir en descripción

❌ **IDs en español**: `consulta_inquiry` → MAL (debe ser `consultation_inquiry` o similar)

## Ejemplo de Output Correcto

```json
{
  "existing_appointment_confirmation": {
    "description": "El paciente confirma asistencia a una cita YA EXISTENTE: respondiendo a un recordatorio (IS_REMINDER_REPLY=true) o teniendo una cita activa en el contexto. NO usar cuando el bot acaba de PROPONER una hora nueva para agendar: en ese caso la intención es new_appointment_scheduling (continuar el agendamiento).",
    "examples": ["confirmo", "ahí estaré", "sí, asistiré"]
  },
  "endolift_evaluation_inquiry": {
    "description": "El paciente pregunta por Endolift, un tratamiento de láser fibra exclusivo del Dr. Pablo García que requiere señal de reserva de 30€ y valoración médica previa.",
    "examples": ["¿qué es el endolift?", "precio de endolift", "quiero información del tratamiento endolift"]
  },
  "ultraformer_mpt_inquiry": {
    "description": "El paciente pregunta por ULTRAFORMER MPT, un tratamiento de ultrasonido focalizado. En pacientes nuevos requiere señal de reserva de 150€.",
    "examples": ["¿qué es el ultraformer?", "precio de ultraformer mpt", "¿cuánto cuesta el ultraformer?"]
  },
  "facial_cleansing_inquiry": {
    "description": "El paciente pregunta por limpieza facial o microdermoabrasión, tratamientos estéticos que puede realizar Natalia o Victoria. Permite agendamiento directo incluso en pacientes nuevos.",
    "examples": ["quiero limpieza facial", "¿hacéis microdermoabrasión?", "precio de limpieza de cara"]
  }
}
```

## Reglas de Namespace Reservado (CRÍTICO — el backend RECHAZA el JSON si se viola)

Los prefijos `new_appointment_` y `existing_appointment_` están **RESERVADOS** para la taxonomía canónica. Un id que empiece por cualquiera de ellos DEBE ser exactamente uno de estos 10 ids:

- `new_appointment_scheduling`
- `new_appointment_inquiry`
- `existing_appointment_rescheduling`
- `existing_appointment_reschedule_inquiry`
- `existing_appointment_confirmation`
- `existing_appointment_cancellation`
- `existing_appointment_cancellation_inquiry`
- `existing_appointment_inquiry`
- `existing_appointment_keep`
- `existing_appointment_delay_notice`

**Cualquier otro id bajo esos prefijos (ej: `existing_appointment_moving`, `new_appointment_booking`) es RECHAZADO** porque parece de citas pero no es reconocido por las reglas de seguridad ni por los guards del servidor, así que la protección se apaga en silencio.

Fuera de esos prefijos eres libre: `insurance_coverage_inquiry`, `parking_info`, `payment_inquiry`, `physio_program_followup` son válidos sin problema.

## Checklist antes de entregar
- [ ] 12 baseline intents presentes con descriptions semánticas
- [ ] Un intent por cada servicio mencionado en los archivos de input
- [ ] Descripción menciona profesional asignado si existe
- [ ] Descripción menciona restricciones relevantes (señal, valoración obligatoria, etc.)
- [ ] 2-3 ejemplos realistas por intent
- [ ] IDs en snake_case inglés
- [ ] Descripciones en español natural, no keyword salad
- [ ] Ningún intent inventado que no esté en los archivos de input
- [ ] **NINGÚN intent bajo namespace reservado que no sea canónico**
