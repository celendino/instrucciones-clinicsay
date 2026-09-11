/**
 * SystemToolDescriptions — Tool descriptions are system configuration, not
 * part of the clinic's StructuredLogic JSON.
 *
 * They are kept here so the JSON remains the single source of truth for
 * business behavior, while the phrasing of the function-calling interface is
 * centralized and versioned with the codebase.
 */

/**
 * TASKS_ONLY overrides: tools that should NOT be used for scheduling.
 */
export const TASKS_ONLY_OVERRIDES: Record<string, string> = {
  manage_schedule_block_status:
    'USAR para confirmar, cancelar o marcar en camino UNA cita especifica. ' +
    'Ejecutar esta herramienta directamente con la accion correspondiente (confirm, cancel, on_the_way). ' +
    'NO usar para agendar nuevas citas o reprogramar. ' +
    'Si el paciente quiere gestionar TODAS sus citas, usar manage_all_schedule_blocks_for_date en vez de esta.',

  manage_all_schedule_blocks_for_date:
    'USAR para confirmar, cancelar o marcar en camino TODAS las citas de un paciente en un dia especifico. ' +
    'Ejecutar esta herramienta directamente con la accion correspondiente (confirm, cancel, on_the_way). ' +
    'NO usar para agendar nuevas citas o reprogramar. ' +
    'Si el paciente quiere gestionar UNA sola cita, usar manage_schedule_block_status en vez de esta.',

  create_task:
    'Crear una tarea administrativa para seguimiento humano. ' +
    'En agendamiento nuevo, REQUIERE que resolve_patient haya confirmado nombre, apellido y telefono. ' +
    'USAR cuando NO se pueda agendar directamente o cuando el paciente confirma un horario en modo seguimiento. ' +
    'Recopilar SIEMPRE: nombre, apellidos, telefono, motivo, resumen de la conversacion.',

  lookup_patient:
    'USAR para buscar paciente por telefono, nombre o apellido. ' +
    'Busqueda pura: NUNCA crea pacientes. ' +
    'Basta un nombre y un apellido tal como los dice el interlocutor (sin tildes, con apodo o con un error de tecleo); el telefono desempata. ' +
    'LLAMALA SIEMPRE antes de afirmar que una ficha no existe. ' +
    'Retorna datos personales y citas programadas. ' +
    'La respuesta incluye isNew: true cuando no encuentra pacientes, isNew: false cuando identifica uno, y status "ambiguous" con askFor cuando varias fichas podrian ser la persona: ' +
    'entonces pide EXACTAMENTE el dato de askFor y vuelve a llamar; NUNCA enumeres nombres ni datos de las fichas candidatas. ' +
    'Usar al inicio de la conversacion para ver si es paciente existente.',

  query_knowledge_base:
    'USAR para buscar informacion relevante en el manual de la clinica cuando la respuesta ' +
    'no este ya en el contexto. Busca en protocols, FAQ, responseTemplates y rules. ' +
    'NO sustituye tools de pacientes, citas o tareas.',

  query_protocol:
    'USAR para consultar el contenido completo de un protocolo por su ID. ' +
    'Devuelve el texto literal del protocolo para que puedas usarlo en la respuesta.',
};

/**
 * FULL mode enhancements: add scheduling-specific guidance.
 */
export const FULL_MODE_ENHANCEMENTS: Record<string, string> = {
  check_availability:
    'Buscar horarios disponibles para agendar una cita. ' +
    'USAR cuando el paciente pregunte por horarios, diga "quiero cita", "hay hueco", "busca disponibilidad". ' +
    'Debe llamarse DESPUES de resolve_treatment y resolve_availability_query. ' +
    'Pasa el campo isWeekdayPattern exactamente como venga de resolve_availability_query. ' +
    'El resultado incluye un campo message en español listo para usar: ya contiene todos los horarios disponibles ordenados. ' +
    'Presenta ese campo message exactamente como viene, sin resumir, omitir, reformular ni cambiar el formato de los horarios. ' +
    'Cada "hora" en el message es una hora de INICIO exacta. ' +
    'NUNCA la conviertas en un rango "entre X e Y" ni muestres la duracion como franja. ' +
    'Al reprogramar, usa el mismo professionalId de la cita original como preferencia.',

  schedule_block:
    'Crear una cita real para un paciente. ' +
    'REQUIERE que resolve_patient haya devuelto un patientId antes de llamar. ' +
    'USAR SOLO cuando el paciente confirma una fecha y hora de los HORARIOS_MOSTRADOS. ' +
    'NUNCA llames schedule_block sin haber resuelto al paciente.',

  cancel_for_rescheduling:
    'Cancelar y liberar preparatoriamente una unica cita existente para poder buscar otra fecha. ' +
    'USAR solo cuando el flujo de reagendamiento lo declare y antes de preguntar la nueva fecha. ' +
    'El backend valida el bloque y devuelve el target persistido con care plan y sesiones; nunca inventes esos IDs. ' +
    'NO usar para una cancelacion definitiva: para eso usa manage_schedule_block_status.',

  manage_schedule_block_status:
    'Gestionar el estado de una cita existente: confirmar, cancelar, o marcar en camino. ' +
    'USAR cuando el paciente responda a un recordatorio o diga "cancelo mi cita". ' +
    'Solo llamar si existe una cita activa o recordatorio en el sistema.',

  create_task:
    'Crear una tarea administrativa para seguimiento humano. ' +
    'En agendamiento nuevo, REQUIERE que resolve_patient haya confirmado nombre, apellido y telefono. ' +
    'USAR cuando NO se pueda agendar directamente o cuando el paciente confirma un horario en modo seguimiento. ' +
    'Recopilar SIEMPRE: nombre, apellidos, telefono, motivo, resumen de la conversacion.',

  resolve_patient:
    'Identificar o crear un paciente antes de agendar o crear una tarea de agendamiento. ' +
    'USAR ANTES de schedule_block o create_task de agendamiento si no hay paciente resuelto. ' +
    'REGLA DE ORO: Solo puedes pasar firstName, lastName o phone si el INTERLOCUTOR los dijo EXPLICITAMENTE en su mensaje actual o en mensajes anteriores de ESTA conversacion. ' +
    'NUNCA uses CALLER_PHONE, ASSOCIATED_PATIENTS ni datos del contacto de Kommo como datos confirmados sin autorizacion del interlocutor. ' +
    'El telefono debe ser proporcionado explicitamente por el interlocutor; solo usa el telefono del contacto si el interlocutor indico explicitamente que es el numero desde el que escribe y useInterlocutorPhone es true. ' +
    'Si falta alguno de estos datos, el sistema retorna status "needs_info" y pide los datos faltantes. ' +
    'El sistema busca por telefono + nombre + apellido con tolerancia: basta un nombre y un apellido tal como los dice el interlocutor (sin tildes, con apodo o con un error de tecleo). ' +
    'Si no encuentra ningun paciente, lo crea automaticamente con los datos proporcionados. ' +
    'Si devuelve status "ambiguous", pide EXACTAMENTE el dato indicado en askFor (telefono, segundo apellido, fecha de nacimiento o DNI) y vuelve a llamar con todos los datos acumulados; NUNCA enumeres nombres ni datos de las fichas candidatas. ' +
    'El campo isForInterlocutor solo sirve para auditoria/logging; NO altera la busqueda ni la creacion.',

  resolve_treatment:
    'Encontrar el tratamiento correcto basado en lo que dice el paciente. ' +
    'USAR cuando el paciente describe un tratamiento pero no da un ID exacto. ' +
    'Debe llamarse ANTES de check_availability.',

  resolve_professional:
    'Encontrar el profesional correcto basado en lo que dice el paciente. ' +
    'USAR cuando el paciente menciona un doctor por nombre o pide un especialista. ' +
    'Debe llamarse ANTES de check_availability si se conoce preferencia de profesional.',

  resolve_availability_query:
    'Traducir fechas en lenguaje natural a fechas concretas. ' +
    'USAR cuando el paciente expresa fechas en lenguaje natural ("proxima semana", "maniana"). ' +
    'Debe llamarse ANTES de check_availability.',

  lookup_patient:
    'Buscar paciente por numero de telefono, nombre o apellido. ' +
    'Busqueda pura: NUNCA crea pacientes. ' +
    'USAR para identificar al paciente o revisar su historial de citas. ' +
    'Basta un nombre y un apellido tal como los dice el interlocutor (sin tildes, con apodo o con un error de tecleo); NO hace falta el nombre completo de la ficha. El telefono desempata. ' +
    'LLAMALA SIEMPRE antes de afirmar que una ficha no existe: si quien escribe da un nombre distinto al de ASSOCIATED_PATIENTS, busca su ficha con esta tool antes de responder. ' +
    'REGLA DE ORO: Solo busca con datos que el INTERLOCUTOR haya proporcionado EXPLICITAMENTE en esta conversacion. ' +
    'NUNCA uses CALLER_PHONE, ASSOCIATED_PATIENTS ni datos del contacto de Kommo como criterio de busqueda automatico. ' +
    'La respuesta incluye isNew: true cuando no encuentra pacientes, isNew: false cuando identifica uno, y status "ambiguous" con askFor cuando varias fichas podrian ser la persona: ' +
    'entonces pide EXACTAMENTE el dato de askFor (telefono, segundo apellido, fecha de nacimiento o DNI) y vuelve a llamar con todo lo acumulado; NUNCA enumeres nombres ni datos de las fichas candidatas. ' +
    'Usar al inicio de la conversacion para ver si es paciente existente. ' +
    'Si no hay telefono, busca por nombre+apellido. Retorna datos personales y citas programadas.',

  query_knowledge_base:
    'USAR para buscar informacion relevante en el manual de la clinica cuando la respuesta ' +
    'no este ya en el contexto. Busca en protocols, FAQ, responseTemplates y rules. ' +
    'NO sustituye tools de pacientes, citas o tareas.',

  query_protocol:
    'USAR para consultar el contenido completo de un protocolo por su ID. ' +
    'Devuelve el texto literal del protocolo para que puedas usarlo en la respuesta.',
};
