/**
 * Chat Bot Tool Definitions — TASKS-ONLY Mode.
 *
 * These tool definitions replicate the ORIGINAL chatbot behavior
 * (before the real availability + booking features were added).
 *
 * Key difference from FULL mode:
 * - check_availability: only creates a Kommo task for human follow-up
 * - schedule_block: only creates a Kommo task for human follow-up
 * - NO resolve_treatment, resolve_professional, resolve_patient, resolve_availability_query
 * - manage_schedule_block_status: operates on real existing blocks (same as FULL)
 *
 * Each tool maps to an existing use case in another bounded context.
 * Tool names use snake_case (OpenAI convention for function calling).
 * Descriptions are in English for code clarity; the system prompt
 * controls the language the LLM uses when interacting with patients.
 */

import type { ChatToolDefinition } from './ports/secondary/chat/openai-conversation.port';

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
    'Identificar o crear un paciente antes de crear una tarea de agendamiento. ' +
    'USAR ANTES de create_task de agendamiento si no hay paciente resuelto. ' +
    'El telefono debe ser proporcionado explicitamente por el interlocutor; no sustituyas phone con datos del contacto. ' +
    'NUNCA uses CALLER_PHONE, ASSOCIATED_PATIENTS ni datos del contacto de Kommo como datos confirmados sin autorizacion del interlocutor. ' +
    'Basta un nombre y un apellido tal como los dice el interlocutor (sin tildes, con apodo o con un error de tecleo). ' +
    'Si devuelve status "ambiguous", pide EXACTAMENTE el dato indicado en askFor y vuelve a llamar; NUNCA enumeres nombres ni datos de las fichas candidatas.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      firstName: {
        type: 'string',
        description: 'Patient first name. Leave empty if the patient has not provided it.',
      },
      lastName: {
        type: 'string',
        description: 'Patient last name. Leave empty if the patient has not provided it.',
      },
      phone: {
        type: 'string',
        description: 'Patient phone number. Leave empty if the patient has not provided it.',
      },
      secondLastName: {
        type: 'string',
        description: 'Second surname, only if the patient gave it or the system asked for it (askFor). Empty string otherwise.',
      },
      birthday: {
        type: 'string',
        description: 'Birth date YYYY-MM-DD, only if the patient gave it or the system asked for it (askFor). Empty string otherwise.',
      },
      idDocumentNumber: {
        type: 'string',
        description: 'Identity document (DNI/NIE/passport), only if the patient gave it or the system asked for it (askFor). Empty string otherwise.',
      },
      useInterlocutorPhone: {
        type: 'boolean',
        description: 'Set to true only when the patient explicitly says "a este numero", "mi numero" or "para mi".',
      },
      isForInterlocutor: {
        type: 'boolean',
        description: 'Set to true only when the patient explicitly says the appointment is for themselves ("para mi").',
      },
    },
    required: ['firstName', 'lastName', 'phone', 'secondLastName', 'birthday', 'idDocumentNumber', 'isForInterlocutor', 'useInterlocutorPhone'],
  },
};

// ========== Tool: lookup_patient ========== //

export const TOOL_LOOKUP_PATIENT: ChatToolDefinition = {
  name: 'lookup_patient',
  strict: true,
  description:
    'Look up a patient record by phone number, first name and/or last name (read-only: never creates). ' +
    'Returns personal data and scheduled appointments. Use to identify the patient or review their history. ' +
    'A partial name is enough: one given name and one surname as the interlocutor says them, without accents, with a nickname or a typo. The phone disambiguates. ' +
    'ALWAYS call this before saying a record does not exist. ' +
    'When it returns status "ambiguous" with askFor, ask the interlocutor EXACTLY for that datum and call again; NEVER list the names or data of the candidate records.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      phone: {
        type: 'string',
        description: 'Phone number to search. Required. Send empty string if not known — the system will search by name.',
      },
      firstName: {
        type: 'string',
        description: 'Patient first name. Required. Send empty string if not known — the system will search by phone.',
      },
      lastName: {
        type: 'string',
        description: 'Patient last name, first surname is enough. Required. Send empty string if not known — the system will search by phone.',
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

export const ALL_CHAT_TOOLS_TASKS_ONLY: ChatToolDefinition[] = [
  TOOL_MANAGE_SCHEDULE_BLOCK_STATUS,
  TOOL_MANAGE_ALL_SCHEDULE_BLOCKS_FOR_DATE,
  TOOL_CREATE_TASK,
  TOOL_RESOLVE_PATIENT,
  TOOL_LOOKUP_PATIENT,
  TOOL_QUERY_PROTOCOL,
  TOOL_QUERY_KNOWLEDGE_BASE,
];
