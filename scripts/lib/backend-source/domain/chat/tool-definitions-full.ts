/**
 * Chat Bot Tool Definitions — OpenAI function calling schemas.
 *
 * Each tool maps to an existing use case in another bounded context.
 * Tool names use snake_case (OpenAI convention for function calling).
 * Descriptions are in English for code clarity; the system prompt
 * controls the language the LLM uses when interacting with patients.
 */

import type { ChatToolDefinition } from '../../ports/secondary/chat/openai-conversation.port';

// ========== Tool: check_availability ========== //

export const TOOL_CHECK_AVAILABILITY: ChatToolDefinition = {
  name: 'check_availability',
  description:
    'Query available time slots for scheduling an appointment. ' +
    'Requires concrete dates from resolve_availability_query. ' +
    'Returns available continuous windows with doctor_id (professionalId) and sala_id (roomId) ' +
    'for each option. Use these IDs when calling schedule_block. ' +
    'Scheduling policies are applied automatically by the system. ' +
    'When the patient requests a specific time or professional that was NOT shown in the previously displayed slots (see HORARIOS_MOSTRADOS in context), use this tool to verify if that specific option exists. If it exists, it will be returned as a valid slot. If it does not exist, nearby alternatives will be returned with a clear message.',
  parameters: {
    type: 'object',
    properties: {
      treatmentId: {
        type: 'string',
        description: 'Treatment ID to check availability for.',
      },
      professionalId: {
        type: 'string',
        description: 'Professional (doctor/dentist) ID. Optional if the patient has no preference.',
      },
      roomId: {
        type: 'string',
        description: 'Room ID. Usually not specified unless patient has a preference.',
      },
      daysOfWeek: {
        type: 'array',
        items: { type: 'number' },
        description: 'Days of the week to consider (1=Monday..7=Sunday). Optional.',
      },
      isWeekdayPattern: {
        type: 'boolean',
        description:
          'Set to true if the patient asked for a weekday pattern ("los lunes", "lunes y martes", "cualquier lunes"). Set to false/omit if the patient asked for a single occurrence ("el lunes", "este lunes", "próximo lunes"). When true, daysOfWeek is a hard filter; when false, it is only a ranking preference.',
      },
      resolvedDates: {
        type: 'array',
        description: 'Concrete dates with time ranges from resolve_availability_query. REQUIRED — call resolve_availability_query first.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
            timeRanges: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  start: { type: 'string', description: 'Start time in HH:mm.' },
                  end: { type: 'string', description: 'End time in HH:mm.' },
                },
              },
            },
          },
        },
      },
      excludedDates: {
        type: 'array',
        description: 'Dates the user explicitly rejected (e.g., "I can\'t Monday"). ISO 8601 YYYY-MM-DD strings. These dates will be skipped in the search.',
        items: { type: 'string' },
      },
      excludedProfessionalIds: {
        type: 'array',
        description: 'Professional IDs the user explicitly rejected (e.g., "not Dr. Garcia"). These professionals will be excluded from the search.',
        items: { type: 'string' },
      },
      excludedTimeRanges: {
        type: 'array',
        description: 'Specific time ranges the user rejected on specific dates (e.g., "not before 10am on Tuesday"). Windows overlapping these ranges will be truncated or discarded.',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', description: 'Date in YYYY-MM-DD format.' },
            start: { type: 'string', description: 'Start time in HH:mm.' },
            end: { type: 'string', description: 'End time in HH:mm.' },
          },
        },
      },
      ignoreScheduleBlockIds: {
        type: 'array',
        description: 'Schedule block IDs to ignore when checking availability. Used during rescheduling so the appointment being moved does not block its own slot. Only the block being moved belongs here; other appointments must keep blocking.',
        items: { type: 'string' },
      },
    },
    required: ['treatmentId', 'resolvedDates'],
  },
};

// ========== Tool: resolve_availability_query ========== //

export const TOOL_RESOLVE_AVAILABILITY_QUERY: ChatToolDefinition = {
  name: 'resolve_availability_query',
  strict: true,
  description:
    'Translate a natural language time phrase into concrete dates and hour ranges. ' +
    'Use BEFORE check_availability when the patient expresses dates in natural language. ' +
    'Returns structured dates with specific time ranges ready for availability search.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      availabilityPhrase: {
        type: 'string',
        description:
          'The exact phrase from the patient describing when they want the appointment (e.g., "próxima semana por la mañana", "el jueves a las 10:00", "mañana o pasado mañana").',
      },
    },
    required: ['availabilityPhrase'],
  },
};

// ========== Tool: schedule_block ========== //

export const TOOL_SCHEDULE_BLOCK: ChatToolDefinition = {
  name: 'schedule_block',
  description:
    'Crear una cita real para un paciente. ' +
    'REQUIERE que resolve_patient haya devuelto un patientId antes de llamar. ' +
    'USAR SOLO cuando el paciente confirma una fecha y hora de los HORARIOS_MOSTRADOS. ' +
    'NUNCA llames schedule_block sin haber resuelto al paciente.',
  parameters: {
    type: 'object',
    properties: {
      patientId: {
        type: 'string',
        description: 'Patient ID (REQUIRED). Must come from resolve_patient.',
      },
      treatmentId: {
        type: 'string',
        description: 'Treatment ID (REQUIRED).',
      },
      chosenDate: {
        type: 'string',
        description: 'Chosen date for the appointment (YYYY-MM-DD).',
      },
      chosenStartTime: {
        type: 'string',
        description: 'Chosen start time for the appointment (HH:mm).',
      },
      professionalId: {
        type: 'string',
        description: 'ID of the professional (from check_availability doctor_id). Optional.',
      },
      roomId: {
        type: 'string',
        description: 'ID of the room (from check_availability sala_id). Optional.',
      },
      title: {
        type: 'string',
        description: 'Descriptive title for the appointment.',
      },
      notes: {
        type: 'string',
        description: 'Additional notes from the patient.',
      },
    },
    required: ['patientId', 'treatmentId', 'chosenDate', 'chosenStartTime'],
  },
};

// ========== Tool: cancel_for_rescheduling ========== //

export const TOOL_CANCEL_FOR_RESCHEDULING: ChatToolDefinition = {
  name: 'cancel_for_rescheduling',
  strict: true,
  description:
    'Cancel and release one existing appointment as preparation for rescheduling. ' +
    'Use only after resolve_reschedule_target in a configured rescheduling flow, before asking for or checking the new date. ' +
    'It consumes the persisted reschedule target; never provide carePlanId or plannedSessionIds.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scheduleBlockId: {
        type: 'string',
        description: 'Optional identifier from the backend appointment context. Do not invent one.',
      },
      reason: {
        type: 'string',
        description: 'Optional cancellation reason. Defaults to patient request.',
      },
    },
    required: ['scheduleBlockId', 'reason'],
  },
};

// ========== Tool: manage_schedule_block_status ========== //

export const TOOL_MANAGE_SCHEDULE_BLOCK_STATUS: ChatToolDefinition = {
  name: 'manage_schedule_block_status',
  description:
    'Manage the status of an existing schedule block: confirm attendance, ' +
    'cancel, or mark that the patient is on the way.',
  parameters: {
    type: 'object',
    properties: {
      scheduleBlockId: {
        type: 'string',
        description: 'ID of the schedule block to manage.',
      },
      action: {
        type: 'string',
        enum: ['confirm', 'cancel', 'on_the_way'],
        description: 'Action to perform on the schedule block.',
      },
      referenceType: {
        type: 'string',
        enum: ['reminder_reference'],
        description: 'Required when managing a short response to the active reminder. The model must explicitly classify it as reminder_reference; the backend validates the block ID.',
      },
      reason: {
        type: 'string',
        description: 'Reason for cancellation (required when action is "cancel").',
      },
    },
    required: ['scheduleBlockId', 'action'],
  },
};

// ========== Tool: manage_all_schedule_blocks_for_date ========== //

export const TOOL_MANAGE_ALL_SCHEDULE_BLOCKS_FOR_DATE: ChatToolDefinition = {
  name: 'manage_all_schedule_blocks_for_date',
  description:
    'Manage ALL schedule blocks for a patient on a specific date. ' +
    'Used when the patient wants to confirm, cancel, or mark as on-the-way ALL their appointments on a given day. ' +
    'Provide any scheduleBlockId from the target date; the system will find all blocks for that patient on the same day.',
  parameters: {
    type: 'object',
    properties: {
      scheduleBlockId: {
        type: 'string',
        description: 'ID of any schedule block on the target date. Used to determine the date and patient.',
      },
      action: {
        type: 'string',
        enum: ['confirm', 'cancel', 'on_the_way'],
        description: 'Action to perform on all schedule blocks for the patient on that date.',
      },
      reason: {
        type: 'string',
        description: 'Reason for cancellation (required when action is "cancel").',
      },
    },
    required: ['scheduleBlockId', 'action'],
  },
};

// ========== Tool: create_task ========== //

export const TOOL_CREATE_TASK: ChatToolDefinition = {
  name: 'create_task',
  description:
    'Crear una tarea administrativa para seguimiento humano. ' +
    'En agendamiento nuevo, REQUIERE que resolve_patient haya confirmado nombre, apellido y telefono. ' +
    'USAR cuando NO se pueda agendar directamente o cuando el paciente confirma un horario en modo seguimiento.',
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Descriptive title for the task.',
      },
      description: {
        type: 'string',
        description: 'Detailed description of what needs to be done.',
      },
      type: {
        type: 'string',
        description: 'Task type (e.g. "follow_up", "billing", "information").',
      },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH'],
        description: 'Task priority level.',
      },
      patientId: {
        type: 'string',
        description: 'ID of the related patient (if known).',
      },
      patientPhone: {
        type: 'string',
        description: 'Phone number of the person to contact for this task (if patientId is not known).',
      },
      patientFirstName: {
        type: 'string',
        description: 'First name of the person to contact (if patientId is not known).',
      },
      patientLastName: {
        type: 'string',
        description: 'Last name of the person to contact (if patientId is not known).',
      },
      dueAt: {
        type: 'string',
        description: 'Task deadline (ISO 8601, optional).',
      },
    },
    required: ['title', 'type'],
  },
};

// ========== Tool: resolve_patient ========== //

export const TOOL_RESOLVE_PATIENT: ChatToolDefinition = {
  name: 'resolve_patient',
  strict: true,
  description:
    'Identificar o crear un paciente antes de agendar o crear una tarea de agendamiento. ' +
    'USAR ANTES de schedule_block o create_task de agendamiento si no hay paciente resuelto. ' +
    'Solo puedes pasar firstName, lastName o phone si el INTERLOCUTOR los dijo EXPLICITAMENTE en su mensaje actual o en mensajes anteriores de ESTA conversacion. ' +
    'NUNCA uses CALLER_PHONE, ASSOCIATED_PATIENTS ni datos del contacto de Kommo como datos confirmados sin autorizacion del interlocutor. ' +
    'El telefono debe ser el que el interlocutor haya proporcionado explicitamente; solo usa el telefono del contacto si el interlocutor indico explicitamente que es el numero desde el que escribe y useInterlocutorPhone es true. ' +
    'Si falta alguno de estos datos, el sistema retorna status "needs_info" y pide los datos faltantes. ' +
    'El sistema busca por telefono + nombre + apellido con tolerancia: basta un nombre y un apellido tal como los dice el interlocutor (sin tildes, con apodo o con un error de tecleo); NO hace falta el nombre completo de la ficha. ' +
    'Si no encuentra ningun paciente, lo crea automaticamente con los datos proporcionados. ' +
    'Si devuelve status "ambiguous", pide EXACTAMENTE el dato indicado en askFor (telefono, segundo apellido, fecha de nacimiento o DNI) y vuelve a llamar con todos los datos acumulados; NUNCA enumeres nombres ni datos de las fichas candidatas. ' +
    'El campo isForInterlocutor solo sirve para auditoria/logging; NO altera la busqueda ni la creacion.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      firstName: {
        type: 'string',
        description: 'Patient first name. Required. Send empty string if not yet known — the system will ask.',
      },
      lastName: {
        type: 'string',
        description: 'Patient last name (first surname is enough). Required. Send empty string if not yet known — the system will ask.',
      },
      phone: {
        type: 'string',
        description: 'Patient phone number (with or without country code). Required and never substituted from the Kommo contact.',
      },
      secondLastName: {
        type: 'string',
        description: 'Second surname, only if the interlocutor gave it or the system asked for it (askFor). Empty string otherwise.',
      },
      birthday: {
        type: 'string',
        description: 'Birth date YYYY-MM-DD, only if the interlocutor gave it or the system asked for it (askFor). Empty string otherwise.',
      },
      idDocumentNumber: {
        type: 'string',
        description: 'Identity document (DNI/NIE/passport), only if the interlocutor gave it or the system asked for it (askFor). Empty string otherwise.',
      },
      isForInterlocutor: {
        type: 'boolean',
        description: 'Set to true if the booking is for the person chatting. Used only for audit/logging; it does NOT auto-fill any data from the caller\'s contact.',
      },
      useInterlocutorPhone: {
        type: 'boolean',
        description: 'Set true solo si el interlocutor indico explicitamente que se use el telefono del contacto; nunca lo actives automaticamente.',
      },
    },
    required: ['firstName', 'lastName', 'phone', 'secondLastName', 'birthday', 'idDocumentNumber', 'isForInterlocutor', 'useInterlocutorPhone'],
  },
};

export const TOOL_RESOLVE_RESCHEDULE_TARGET: ChatToolDefinition = {
  name: 'resolve_reschedule_target',
  strict: true,
  description:
    'Resolve the single existing appointment that the patient means to reschedule. ' +
    'Use before cancel_for_rescheduling. ' +
    'PASS EVERY CLUE THE CONVERSATION ALREADY CONTAINS — date, treatment and professional — including clues given in EARLIER messages, not only in the last one. ' +
    'An empty field states that the patient never gave that clue. Dropping a clue the patient did give makes the backend see several possible appointments and forces the bot to ask "which one?" about something already answered. ' +
    'The backend selects the unique matching appointment and derives whether it is the reminder. Never invent IDs.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      scheduleBlockId: {
        type: 'string',
       description: 'Optional exact Block ID copied from the active patient context. Never invent one; prefer date/professional/treatment clues when the patient did not provide an ID.',
      },
      date: {
        type: 'string',
        description: 'Appointment date in YYYY-MM-DD. REQUIRED whenever the patient named a day at any point in the conversation ("mi cita del 9 de septiembre" -> "2026-09-09"), even if they named it several messages ago. Empty ONLY when no day has been mentioned at all.',
      },
      professionalId: {
        type: 'string',
        description: 'Professional ID from the patient context whenever it is known. Empty only when unknown.',
      },
      professionalName: {
        type: 'string',
        description: 'Professional name as stated by the patient at any point in the conversation, or as shown in context. Empty only when no professional has been mentioned.',
      },
      treatmentId: {
        type: 'string',
        description: 'Treatment ID from the patient context whenever it is known. Empty only when unknown.',
      },
      treatmentName: {
        type: 'string',
        description: 'Treatment name as stated by the patient at any point in the conversation, or as shown in context. A partial name is useful ("mesoterapia" matches "Mesoterapia Corporal"). Empty only when no treatment has been mentioned.',
      },
      referenceType: {
        type: 'string',
        enum: ['reminder_reference', 'other_appointment_reference', 'third_party_reference', 'unrelated_request', 'ambiguous_reference'],
        description: 'Explicit classification of what the patient refers to. Short confirmation/delay of the reminder uses reminder_reference; another date/professional/treatment uses other_appointment_reference; another person uses third_party_reference; unrelated or unclear messages use the corresponding value.',
      },
      confirmPivot: {
        type: 'boolean',
        description: 'Set true only after the patient explicitly confirms moving a different appointment after a previous rescheduling cancellation.',
      },
    },
    required: ['scheduleBlockId', 'date', 'professionalId', 'professionalName', 'treatmentId', 'treatmentName', 'referenceType', 'confirmPivot'],
  },
};

// ========== Tool: resolve_professional ========== //

export const TOOL_RESOLVE_PROFESSIONAL: ChatToolDefinition = {
  name: 'resolve_professional',
  strict: true,
  description:
    'Match the patient message to an available professional (doctor/dentist). ' +
    'Use when the patient mentions a doctor by name, describes a symptom that requires a specialist, ' +
    'or asks "who does X?". Returns the matched professional ID, name, and confidence. ' +
    'Call this BEFORE check_availability if the professional is not known.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      patientMessage: {
        type: 'string',
        description: 'The exact message from the patient describing the professional they want or asking about specialties.',
      },
    },
    required: ['patientMessage'],
  },
};

// ========== Tool: resolve_treatment ========== //

export const TOOL_RESOLVE_TREATMENT: ChatToolDefinition = {
  name: 'resolve_treatment',
  strict: true,
  description:
    'Match the patient message to an available treatment from the catalog. ' +
    'Use when the patient describes a treatment but does not provide an exact treatmentId. ' +
    'Returns the matched treatment ID, name, and confidence. ' +
    'Call this BEFORE check_availability if the treatment is not known.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      clarifiedTreatmentRequest: {
        type: 'string',
        description:
          'Resumen o frase aclarada suficiente para identificar un tratamiento. Si aplica una valoración, debe mencionar explícitamente el nombre exacto del tratamiento de valoración y el área correspondiente, tomados de la guía o del catálogo de la clínica.',
      },
    },
    required: ['clarifiedTreatmentRequest'],
  },
};

// ========== Tool: lookup_patient ========== //

export const TOOL_LOOKUP_PATIENT: ChatToolDefinition = {
  name: 'lookup_patient',
  strict: true,
  description:
    'Look up a patient record by phone number, first name and/or last name (read-only: never creates). ' +
    'Returns personal data and scheduled appointments. Use to identify the patient or review their history. ' +
    'A partial name is enough: one given name and one surname as the interlocutor says them, without accents, with a nickname or a typo; the full name in the record is NOT required. The phone disambiguates. ' +
    'ALWAYS call this before saying a record does not exist. ' +
    'The response includes isNew: true when no patients are found, isNew: false when one is identified, and status "ambiguous" with askFor when several records could be the person: ' +
    'then ask the interlocutor EXACTLY for the datum in askFor (phone, second surname, birth date or ID document) and call again with everything gathered; NEVER list the names or data of the candidate records.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      phone: {
        type: 'string',
        description: 'Phone number to search (optional if firstName/lastName provided). Empty string if not given.',
      },
      firstName: {
        type: 'string',
        description: 'Patient first name (optional if phone provided). Empty string if not given.',
      },
      lastName: {
        type: 'string',
        description: 'Patient last name, first surname is enough (optional if phone provided). Empty string if not given.',
      },
      secondLastName: {
        type: 'string',
        description: 'Second surname, only if given or requested via askFor. Empty string otherwise.',
      },
      birthday: {
        type: 'string',
        description: 'Birth date YYYY-MM-DD, only if given or requested via askFor. Empty string otherwise.',
      },
      idDocumentNumber: {
        type: 'string',
        description: 'Identity document (DNI/NIE/passport), only if given or requested via askFor. Empty string otherwise.',
      },
    },
    required: ['phone', 'firstName', 'lastName', 'secondLastName', 'birthday', 'idDocumentNumber'],
  },
};

// ========== Tool: query_protocol ========== //

export const TOOL_QUERY_PROTOCOL: ChatToolDefinition = {
  name: 'query_protocol',
  strict: true,
  description:
    'Retrieve the full content of a clinic protocol by its ID. ' +
    'Use when the patient asks about a specific protocol that was not loaded in the initial system prompt. ' +
    'Returns the protocol name, description, response template, and all sections.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      protocolId: {
        type: 'string',
        description: 'The protocol identifier (e.g., "signature_implants", "first_visit").',
      },
    },
    required: ['protocolId'],
  },
};

// ========== Tool: query_knowledge_base ========== //

export const TOOL_QUERY_KNOWLEDGE_BASE: ChatToolDefinition = {
  name: 'query_knowledge_base',
  strict: true,
  description:
    'Search the clinic knowledge base (protocols, FAQs, response templates, and rules) for information relevant to the patient message. ' +
    'Use ONLY when you do not already have the answer in your current context. ' +
    'Returns the most relevant sections with their full content so you can answer naturally. ' +
    'Do NOT use this for patient identification, scheduling, or task creation — use the specific tools for those.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: {
        type: 'string',
        description: 'The patient message or a concise search query derived from it (e.g., "what treatments do you offer", "parking information").',
      },
      scope: {
        type: 'string',
        enum: ['protocols', 'faq', 'templates', 'rules', 'all'],
        description: 'Optional scope to narrow the search. Use "all" (default) unless the patient explicitly asks about a specific category.',
      },
    },
    required: ['query', 'scope'],
  },
};

// ========== All tools grouped ========== //

export const ALL_CHAT_TOOLS: ChatToolDefinition[] = [
  TOOL_RESOLVE_AVAILABILITY_QUERY,
  TOOL_CHECK_AVAILABILITY,
  TOOL_SCHEDULE_BLOCK,
  TOOL_CANCEL_FOR_RESCHEDULING,
  TOOL_MANAGE_SCHEDULE_BLOCK_STATUS,
  TOOL_MANAGE_ALL_SCHEDULE_BLOCKS_FOR_DATE,
  TOOL_CREATE_TASK,
  TOOL_RESOLVE_PATIENT,
  TOOL_RESOLVE_RESCHEDULE_TARGET,
  TOOL_RESOLVE_PROFESSIONAL,
  TOOL_RESOLVE_TREATMENT,
  TOOL_LOOKUP_PATIENT,
  TOOL_QUERY_PROTOCOL,
  TOOL_QUERY_KNOWLEDGE_BASE,
];
