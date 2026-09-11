/**
 * StructuredLogic — Types and utilities for clinic chatbot configuration.
 *
 * The JSON stored in KommoBot.metadata.structuredLogic drives all bot behavior.
 * This is the single source of truth for:
 * - Which tools the bot can use
 * - In what order (flows)
 * - Which rules apply before each LLM call
 * - Error categories for semantic classification
 * - Protocols for specific situations
 *
 * Architecture Principle:
 * Rules are FILTERS (allow/block), never executors.
 * Flows are the ONLY source of orchestration (tools, steps, templates).
 */

export type ClinicCapabilities = {
  /** Whether the bot should handle sensitive/emotional situations with special protocols. */
  sensitiveSituations: boolean;
  /** Whether the bot has explicit clinical protocols available. */
  protocols: boolean;
};

// Re-export conversation resumption types from their canonical domain file.
export { type ConversationResumptionConfig, type ConversationResumptionType } from './conversation-resumption';
import type { ConversationResumptionConfig } from './conversation-resumption';
import { reconcileFlowSelections } from './canonical-flow-selection';

/**
 * Derive scheduling capability from the external chat mode.
 * The JSON does not store this; it is computed at runtime.
 */
export function getSchedulingCapability(chatMode: StructuredLogicChatMode): boolean {
  return chatMode === 'full';
}
// ========== Text-derived sections (single source of truth) ========== //

export type SocialLink = {
  /** Social platform name (e.g., "instagram", "facebook") */
  platform: string;
  /** Profile URL */
  url: string;
};

export type AdditionalContact = {
  /** Contact type (e.g., "whatsapp", "telegram", "fax") */
  type: string;
  /** Contact value (e.g., phone number or handle) */
  value: string;
  /** Optional human-readable label */
  label?: string;
};

export type BotIdentity = {
  /** Name shown to the patient for the bot */
  botName?: string;
  /** Commercial name of the clinic */
  clinicName?: string;
  /** Clinic address */
  address?: string;
  /** Clinic phone/WhatsApp */
  phone?: string;
  /** Clinic email */
  email?: string;
  /** Clinic website */
  website?: string;
  /** Opening hours text */
  openingHours?: string;
  /** Language policy: 'auto' detects the patient's language, or a fixed language code */
  language?: 'auto' | string;
  /** Persona/role of the bot (e.g., "asistente virtual de la clínica") */
  persona?: string;
  /** Conversational tone (e.g., "cariñoso, cercano y amable") */
  tone?: string;
  /** Farewell message used by the bot */
  farewellMessage?: string;
  /** Message shown when escalating to a human */
  escalationMessage?: string;
  /** Social media links for the clinic */
  socialLinks?: SocialLink[];
  /** Additional contact channels (e.g., WhatsApp business, Telegram) */
  additionalContacts?: AdditionalContact[];
};

export type TimeGreetingLabel = 'dias' | 'tardes' | 'noches';

export type TimeGreetingRange = {
  /** Time-of-day label: dias, tardes, or noches */
  label: TimeGreetingLabel;
  /** Start time in HH:mm format (inclusive) */
  start: string;
  /** End time in HH:mm format (inclusive) */
  end: string;
  /** Greeting phrase for this range, e.g. "buenos días" */
  greeting: string;
};

export type StyleRules = {
  /** Brevity rule, e.g. "1-2 short sentences" */
  brevity?: string;
  /** Format rule, e.g. "plain text only, no markdown, no asterisks" */
  format?: string;
  /** Tone description, e.g. "cariñoso, cercano y amable" */
  tone?: string;
  /** Emoji policy */
  emojiPolicy?: 'allowed' | 'forbidden' | 'contextual';
  /** Language policy: 'auto' or fixed language */
  languagePolicy?: 'auto' | string;
  /** Whether the bot must refuse to diagnose or give medical advice */
  noMedicalDiagnosis?: boolean;
  /** Whether asterisks are forbidden */
  noAsterisks?: boolean;
  /** Whether markdown formatting is forbidden */
  noMarkdown?: boolean;
  /** Maximum number of sentences per response */
  maxSentences?: number;
  /** Maximum number of words per sentence */
  maxWordsPerSentence?: number;
  /** Phrases the bot must never use */
  avoidPhrases?: string[];
  /** Phrases the bot should include when relevant */
  mandatoryPhrases?: string[];
  /** Additional free-form style rules */
  additionalRules?: string[];
  /** Whether the bot must offer human handoff when appropriate */
  mustOfferHumanHandoff?: boolean;
  /**
   * Required. Exactly 3 time-of-day greeting ranges covering the full 24h cycle.
   * Printed as reference in the system prompt so the bot chooses the correct greeting
   * based on LOCAL_TIME when the situation calls for it.
   */
  timeGreetingRanges: TimeGreetingRange[];
};

export type ResponseTemplateMode = 'literal' | 'model';

export type ResponseTemplate = {
  /** Template text */
  text: string;
  /** Response mode: literal (exact) or model (adapted by LLM). Defaults vary by policy. */
  mode?: ResponseTemplateMode;
};

export type ResponseTemplates = {
  /** Named response templates the bot can use */
  [key: string]: ResponseTemplate;
};

export type FaqEntry = {
  /** Question text */
  question: string;
  /** Answer text */
  answer: string;
  /** Optional condition for when this FAQ applies */
  condition?: string;
};

export type ToolFlowSelection = {
  /** Capabilities that must ALL be present for this flow to be eligible.
   * Only turn-start capabilities are allowed here (e.g., 'hasResolvedPatient').
   */
  requiredCapabilities?: string[];
  /** At least one alternative can satisfy the selection instead. */
  alternativeRequiredCapabilities?: string[];
  /** Capabilities that must ALL be absent for this flow to be eligible.
   * Only turn-start capabilities are allowed here (e.g., 'hasResolvedPatient').
   */
  excludedCapabilities?: string[];
};

export type ToolOrchestration = {
  /** Named flows (e.g., "schedule_appointment", "confirm_appointment") */
  flows: Record<string, ToolFlow>;
};

export type ToolFlow = {
  /** Semantic intent reference (matches an intent from the intents catalog) */
  intent: string;
  description: string;
  /**
   * Optional capability-based selection criteria. When multiple flows share the
   * same intent, the runtime picks the first flow whose selection is satisfied
   * by the available turn-start capabilities.
   */
  selection?: ToolFlowSelection;
  steps: ToolStep[];
  /** Registry key for the response template used after the flow completes. */
  responseTemplateKey?: string;
  /** Optional explicit tool whitelist for the LLM in this flow */
  allowedTools?: string[];
  /**
   * If true, the LLM may return an empty response (silence) in this flow.
   * Only the farewell flow should have this flag enabled.
   */
  allowsSilence?: boolean;
};

export type ToolStep = {
  step: number;
  tools: string[];
  parallel: boolean;
  required?: string[];
  note?: string;
};

export type BusinessRuleCondition = {
  /** Field to evaluate (e.g., "day_of_week", "treatment_category") */
  field: string;
  /** Operator (e.g., "equals", "in", "gt", "lt") */
  operator: 'equals' | 'in' | 'not_in' | 'gt' | 'lt' | 'gte' | 'lte' | 'contains' | 'exists';
  /** Value to compare against */
  value: unknown;
  /** If true, the result of this condition is negated before combining with the others. */
  negated?: boolean;
  /** Optional human-readable note for the advisor */
  note?: string;
};

/**
 * Rules are filters, never executors.
 * Only "allow" and "block" are valid actions.
 * Task creation, protocol injection, and data collection belong in flows.
 */
export type StructuredLogicChatMode = 'full' | 'tasks-only';

export type BusinessRuleAction = 'allow' | 'block';

export type BusinessRule = {
  /** Unique identifier for the rule */
  id: string;
  /** Semantic intent reference (matches an intent from the intents catalog) */
  intent: string;
  /** Description for the intent classifier (how to recognize this intent).
   * Must describe intent in natural language, NEVER list keywords.
   * Required: the validator already rejects rules without a description.
   */
  description: string;
  /** How to combine the conditions. Default 'and'. */
  conditionLogic?: 'and' | 'or';
  /** Conditions evaluated against the rule context. */
  conditions?: BusinessRuleCondition[];
  /** What to do when the rule fires. Rules are filters only. */
  action: BusinessRuleAction;
  /** Human-readable note for the advisor */
  note?: string;
  /** Machine-readable reason for the rule (e.g., "missing_patient_data") */
  reason?: string;
  /** Human-readable message to show when the rule blocks the conversation */
  message?: string;
  /** Fields that must be collected before the rule allows proceeding */
  requiredFields?: string[];
  /** Priority for evaluation order. Higher values are evaluated first. Default 0. */
  priority?: number;
  /** If true, the bot must not mention the treatment price in this conversation. */
  hidePrice?: boolean;
  /** If true, the bot should redirect this request to a human task instead of booking. */
  redirectToTask?: boolean;
  /** If true, the bot should only provide information; do not schedule or create tasks. */
  informOnly?: boolean;
  /** Optional protocol to inject into the system prompt when this rule fires. */
  protocolId?: string;
};

export type Protocol = {
  /** Human-readable name */
  name: string;
  /** Description of the protocol */
  description: string;
  /** Response template text to inject into the system prompt */
  responseTemplate: string;
  /** Optional sections (for complex protocols) */
  sections?: string[];
};

export type ErrorCategory = {
  /** Unique identifier for the error category (e.g., "scheduling_conflict") */
  id: string;
  /** Human-readable description of what this error category means.
   * Must define the error in natural language, NEVER list keywords.
   */
  description: string;
  /** Optional keywords or phrases that typically indicate this error */
  keywords?: string[];
  /** Suggested actions to resolve the error (shown to LLM) */
  suggestions: string[];
};

export type TreatmentPolicyType =
  | 'allowed_days'
  | 'allowed_hours'
  | 'allowed_professionals'
  | 'min_notice'
  | 'start_minutes';

export type TreatmentPolicyHint = {
  /** Optional treatment identifier */
  treatmentId?: string;
  /** Optional treatment name for readability */
  treatmentName?: string;
  /** Optional category identifier */
  categoryId?: string;
  /** Optional category name for readability */
  categoryName?: string;
  /** Why this constraint exists */
  reason: string;
  /** Recommended scheduling policies that must be configured in the Scheduling module */
  recommendedPolicies: Array<{
    type: TreatmentPolicyType;
    description: string;
    whyNotInStructuredLogic: string;
  }>;
};

export type GlobalSchedulingPolicy = {
  /** Treatment identifier, or null for the clinic-wide policy. */
  treatmentId: string | null;
  /** Allowed appointment start minutes within an hour. */
  allowedStartMinutes: number[];
};

export type SystemPromptInstructions = {
  /** Notes for the advisor/instruction builder (not shown to the LLM) */
  notesForAdvisor: string[];
  /** Known gaps in the current configuration */
  knownGaps: string[];
  /** Recommended next steps to improve the configuration */
  recommendedNextSteps: string[];
};

/**
 * The root structured logic object stored in metadata.structuredLogic
 */
export type IntentDefinition = {
  /** Human-readable description of what this intent means */
  description: string;
  /** Example phrases that typically trigger this intent */
  examples?: string[];
};

export type IntentCatalog = {
  /** Semantic intent catalog. The backend does not hardcode intent names.
   * The classifier reads these descriptions to match patient messages.
   */
  [intentId: string]: IntentDefinition;
};

export type ChatService = {
  /** Name of the treatment or pack (e.g., "Limpieza dental", "Bono 5 sesiones") */
  name: string;
  /** Brief description for the patient */
  description?: string;
  /**
   * Free-text pricing / promotion info.
   * Examples: "45€ por sesión", "Pack 3x2: 120€", "Requiere valoración personalizada en consulta"
   */
  priceDescription?: string;
  /** If true, the bot should offer to book a consultation for evaluation */
  requiresConsultation?: boolean;
  /** Category for grouping (e.g., "Dental", "Medicina estética") */
  category?: string;
};

export type ServiceCatalog = {
  /** Treatments and services the bot can mention. Configured manually by the clinic. */
  treatments: ChatService[];
  /** Packs / bundles the bot can mention. Optional. */
  packs?: ChatService[];
};

export type StructuredLogic = {
  /** Schema version */
  version: string;
  /** Maximum number of availability slots shown to the patient; the server enforces the effective limit. */
  maxVisibleSlots?: number;
  /** Optional chat scheduling start-minute policies. A specific real treatment ID takes precedence over null (clinic-wide). */
  globalSchedulingPolicies?: GlobalSchedulingPolicy[];
  /** What capabilities this clinic has */
  capabilities: ClinicCapabilities;
  /** Bot identity and clinic contact information */
  identity?: BotIdentity;
  /** Style and tone rules */
  styleRules?: StyleRules;
  /** Named response templates the bot should use for common scenarios */
  responseTemplates?: ResponseTemplates;
  /** Frequently asked questions and their answers */
  faq?: FaqEntry[];
  /** Catalog of treatments and packs the bot can reference for pricing and promotions */
  serviceCatalog: ServiceCatalog;
  /** Semantic intent catalog. Required: the classifier reads these descriptions to match patient messages. */
  intents: IntentCatalog;
  /** Tool orchestration flows */
  toolOrchestration: ToolOrchestration;
  /** Business rules evaluated before each LLM call */
  rules: BusinessRule[];
  /** Named protocols (e.g., "signature_implants", "pregnancy_weeks") */
  protocols?: Record<string, Protocol>;
  /** Error categories for semantic error classification (replaces hardcoded regex) */
  errorCategories?: ErrorCategory[];
  /**
   * Hints about scheduling policies that must be configured in the Scheduling module
   * (`/v1/scheduling-policies`), not inside this JSON. Used by the builder to guide the advisor.
   */
  treatmentPolicyHints?: TreatmentPolicyHint[];
  /**
   * Indicaciones de la clínica sobre CÓMO IDENTIFICAR el tratamiento correcto
   * para lo que pide el paciente. Prosa libre que se inyecta en el prompt del
   * orquestador, junto al catálogo real de la sede; no se inyecta en la llamada
   * interna de `resolve_treatment`.
   *
   * No confundir con `treatmentPolicyHints`, que trata de las políticas de
   * scheduling (FILTRAN qué se puede agendar y cuándo). Esto IDENTIFICA cuál es
   * el tratamiento adecuado: p. ej. "si el paciente es nuevo y pide un
   * tratamiento concreto, lo recomendable es una cita de valoración".
   *
   * Se escriben los NOMBRES tal cual están en el catálogo, nunca IDs. El servidor
   * deriva los claims operativos a partir de ejecuciones reales de tools.
   */
  treatmentSelectionGuidance?: string;
  /**
   * Builder-facing metadata: notes, known gaps, and recommended next steps.
   * The runtime does NOT render this into the LLM system prompt.
   */
  systemPromptInstructions?: SystemPromptInstructions;
  /**
   * Temporal conversation-resumption instructions. Each clinic configures style
   * guidance per resumption hito (continuous, short_break, same_period, recent, distant).
   * Thresholds are fixed by the domain; only the text instructions are configurable.
   */
  conversationResumption?: ConversationResumptionConfig;
  /**
   * @deprecated Ignored by runtime delegation. Availability is automatic in
   * full mode; retained for compatibility with existing JSON configuration.
   */
  availabilitySubagent?: {
    enabled?: boolean;
  };
};

/**
 * Baseline intent catalog every clinic should declare.
 * Reuse these canonical ids so flows, rules and classifier stay aligned.
 */
export const BASELINE_INTENTS: IntentCatalog = {
  existing_appointment_confirmation: {
    description: 'El paciente confirma asistencia a una cita ya reservada, normalmente respondiendo a un recordatorio.',
    examples: ['confirmo', 'ahí estaré'],
  },
  existing_appointment_cancellation: {
    description:
      'El paciente cancela una cita existente o indica que no podrá asistir sin pedir reagendarla. ' +
      'NO preguntar el motivo al paciente. El campo "reason" es obligatorio en la tool; usar "Solicitud del paciente". ' +
      'Si el paciente cancela y luego pide "restablecer" en el mismo turno, tratar como new_appointment_scheduling (reagendar).',
    examples: ['cancela mi cita', 'no puedo ir mañana', 'anula la sesion'],
  },
  existing_appointment_inquiry: {
    description: 'El paciente pregunta por citas que ya tiene reservadas (horarios, fechas). Las del titular del número están en el contexto; para otra persona o un número distinto el bot busca la ficha con lookup_patient.',
    examples: ['¿cuándo es mi cita?'],
  },
  new_appointment_scheduling: {
    description:
      'El paciente quiere reservar una NUEVA cita, sin referirse a mover una cita ya reservada, o consultar disponibilidad. ' +
      'También incluye "restablecer" una cita que acaba de cancelar en este mismo turno de conversacion, ' +
      'usando los datos disponibles en el historial de tool outputs del turno actual.',
    examples: ['quiero pedir cita', '¿tenéis hueco el viernes?', 'restablecer la cita que acabo de anular'],
  },
  general_inquiry: {
    description: 'Preguntas generales sobre la clínica: horarios, ubicación, contacto, precios fijos.',
    examples: ['¿qué horario tenéis?'],
  },
  human_follow_up: {
    description: 'Solicitudes que requieren seguimiento humano y no encajan en lo anterior.',
    examples: ['quiero hablar con una persona'],
  },
  farewell: {
    description: 'El paciente se despide, agradece o cierra la conversación de forma amable.',
    examples: ['adios', 'gracias', 'hasta luego', 'nos vemos', 'chao', 'ok'],
  },
  existing_appointment_rescheduling: {
    description:
      'El paciente quiere MOVER una cita ya agendada a otra fecha u hora. ' +
      'Tambien incluye que no podra asistir y pide explicitamente rebook, reagendar, mover o cambiar la cita, incluso si la cita es para un familiar o tercero y el mensaje esta en ingles. ' +
      'Incluye: (a) cambiar a OTRO dia, (b) adelantar o atrasar el MISMO dia, ' +
      '(c) corregir el TITULAR de la cita manteniendo el mismo tratamiento (mismo treatmentId), ' +
      '(d) "restablecer" una cita tras cancelarla en el mismo turno de conversacion. ' +
      'Para (b): filtrar slots del mismo dia. Para (c): cancelar cita actual + crear nueva con mismo treatmentId y paciente correcto. ' +
      'Para (d): solo funciona si la cancelacion ocurrio en este mismo turno (datos en historial de tool outputs). ' +
      'TAMBIEN es este intent cuando el paciente ELIGE uno de los huecos que se le acaban de enseñar ' +
      'durante una consulta de cambio: elegir ES la confirmacion de que quiere moverla. ' +
      'NO lo es proponer un dia o una franja sin haber visto huecos todavia ("el viernes por la tarde"): ' +
      'eso sigue siendo la consulta, porque reprogramar cancela la cita actual y no se cancela nada ' +
      'hasta que el paciente ha visto opciones reales y ha escogido una.',
    examples: [
      '¿podemos cambiar mi cita al jueves?',
      "Barnaby won't be able to attend, please rebook us",
      'La cita de mi hijo es el viernes, ¿podemos cambiarla?',
      'muevela a la tarde',
      'adelantala a las 10h',
      'la cita es para mi pareja, no para mi',
      'restablecer la cita que acabo de cancelar',
      // Elegir entre los huecos ya enseñados: esto SI confirma el cambio.
      'me quedo con la de las 16:00',
      'la primera opcion me sirve',
      'esa misma, el jueves a las 10',
      'perfecto, la de las 09:05',
      'si, esa',
    ],
  },
  existing_appointment_delay_notice: {
    description: 'El paciente avisa que llegara tarde a una cita confirmada.',
    examples: ['voy con 10 minutos de retraso'],
  },
  existing_appointment_reschedule_inquiry: {
    description:
      'El paciente pregunta si puede cambiar una cita existente, o dice CUANDO le vendria bien sin ' +
      'haber visto todavia ningun hueco concreto. Proponer un dia o una franja ("el viernes por la ' +
      'tarde", "el lunes 7 a partir de las 12:30") es parte de la consulta: dice donde mirar, no que ' +
      'se confirme el cambio. El bot consulta la agenda y le enseña opciones sin tocar su cita. ' +
      'El intent pasa a "existing_appointment_rescheduling" cuando el paciente ELIGE uno de los huecos ' +
      'que ya se le enseñaron.',
    examples: [
      '¿Se puede cambiar mi cita?',
      '¿Podria moverla a otro dia?',
      '¿es posible reprogramar?',
      // Proponer cuando, sin haber visto huecos: sigue siendo consulta.
      'el viernes por la tarde o el sabado',
      'el lunes 7 a partir de las 12:30',
      'podria ser el jueves por la mañana?',
      'si, el jueves',
    ],
  },
  existing_appointment_cancellation_inquiry: {
    description: 'El paciente consulta sobre cancelacion o pregunta que pasaria si no puede asistir, sin ordenar la cancelacion directamente.',
    examples: ['¿Que pasa si no puedo ir?', '¿Como cancelo una cita?'],
  },
  existing_appointment_keep: {
    description: 'El paciente quiere mantener la cita actual y descartar cualquier propuesta de cambio o cancelacion.',
    examples: ['Dejala igual', 'Olvida el cambio', 'Mejor mantengamos la cita'],
  },
};

/**
 * Default/empty structured logic.
 * When a clinic has no structuredLogic, it falls back to capabilities.
 */
export const DEFAULT_STRUCTURED_LOGIC: StructuredLogic = {
  version: '1.0',
  maxVisibleSlots: 9,
  globalSchedulingPolicies: [],
  capabilities: {
    sensitiveSituations: false,
    protocols: false,
  },
  identity: {},
  styleRules: {
    timeGreetingRanges: [
      { label: 'dias', start: '06:00', end: '13:59', greeting: 'buenos días' },
      { label: 'tardes', start: '14:00', end: '21:00', greeting: 'buenas tardes' },
      { label: 'noches', start: '21:01', end: '05:59', greeting: 'buenas noches' },
    ],
  },
  responseTemplates: {
    information_not_available: { text: 'No tengo esa información en este momento.', mode: 'model' },
    out_of_scope: { text: 'Eso está fuera de mi alcance. ¿Puedo ayudarte con algo más?', mode: 'model' },
    farewell: { text: '¡Hasta luego! Que tengas un buen día.', mode: 'model' },
  },
  faq: [],
  serviceCatalog: {
    treatments: [
      { name: 'Primera visita', description: 'Consulta inicial de evaluación', priceDescription: 'Consultar en clínica', requiresConsultation: true },
    ],
  },
  intents: BASELINE_INTENTS,
  toolOrchestration: {
    flows: {
      farewell: {
        intent: 'farewell',
        description: 'Despedirse del paciente',
        steps: [{ step: 1, tools: [], parallel: false }],
        responseTemplateKey: 'farewell',
        allowsSilence: true,
      },
    },
  },
  rules: [],
  protocols: {},
  errorCategories: [],
  systemPromptInstructions: {
    notesForAdvisor: [],
    knownGaps: [],
    recommendedNextSteps: [],
  },
  conversationResumption: {
    instructions: {
      continuous:
        'El paciente sigue en la conversación. NO saludes de nuevo. Continúa directamente desde el último punto.',
      short_break:
        'Pausa corta (menos de 2 horas). NO saludes de nuevo. Respeta el contexto completo de la conversación activa.',
      same_period:
        'El paciente escribió hoy o ayer. Un saludo breve opcional está permitido ("Hola de nuevo", "Continuamos"). Asume que sigue en la misma intención salvo que diga lo contrario.',
      recent:
        'Han pasado varios días. Saluda cordialmente reconociendo la ausencia. Ofrece un resumen de 1 línea SOLO si hay algo pendiente relevante (cita, tratamiento, duda sin resolver). No asumas que sigue en el hilo antiguo si no hay pending context claro.',
      distant:
        'Han pasado semanas o meses. Saluda reconociendo la ausencia ("Hola, hace tiempo que no hablamos"). NO te presentes como nuevo. ' +
        'Descarta el contexto operativo anterior, incluido cualquier target de reprogramacion y disponibilidad previa. ' +
        'Pregunta cómo puedes ayudarle HOY como en una conversacion nueva. Si hay citas futuras confirmadas, menciónalas brevemente como recordatorio.',
    },
  },
};

export type ExtractStructuredLogicResult =
  | { type: 'success'; logic: StructuredLogic }
  | { type: 'missing' }
  | { type: 'corrupt'; reason: string };

/**
 * Extract structured logic from bot metadata.
 * Returns an explicit result — never a silent fallback.
 */
/**
 * Extract structured logic from bot metadata.
 * Reads from the correct slot based on mode:
 * - 'full' → metadata.structuredLogicFull or metadata.builderStructuredLogicFull
 * - otherwise → metadata.structuredLogic or metadata.builderStructuredLogic
 */
export function extractStructuredLogic(
  metadata: Record<string, unknown> | null | undefined,
  mode?: StructuredLogicChatMode,
): ExtractStructuredLogicResult {
  if (!metadata || typeof metadata !== 'object') {
    return { type: 'missing' };
  }

  const isFull = mode === 'full';
  const logicKey = isFull ? 'structuredLogicFull' : 'structuredLogic';
  const builderKey = isFull ? 'builderStructuredLogicFull' : 'builderStructuredLogic';

  const structuredLogic = metadata[logicKey] as StructuredLogic | undefined;
  const builderStructuredLogic = metadata[builderKey] as StructuredLogic | undefined;
  const effectiveLogic =
    structuredLogic && typeof structuredLogic === 'object'
      ? structuredLogic
      : builderStructuredLogic && typeof builderStructuredLogic === 'object'
        ? builderStructuredLogic
        : undefined;

  if (!effectiveLogic) {
    return { type: 'missing' };
  }

  // Basic validation: must have required fields
  if (!effectiveLogic.version) {
    return { type: 'corrupt', reason: 'Missing required field: version' };
  }
  if (!effectiveLogic.capabilities) {
    return { type: 'corrupt', reason: 'Missing required field: capabilities' };
  }
  if (
    !effectiveLogic.intents ||
    typeof effectiveLogic.intents !== 'object' ||
    Object.keys(effectiveLogic.intents).length === 0
  ) {
    return { type: 'corrupt', reason: 'Missing or empty required field: intents' };
  }
  if (!effectiveLogic.toolOrchestration) {
    return { type: 'corrupt', reason: 'Missing required field: toolOrchestration' };
  }
  if (!Array.isArray(effectiveLogic.rules)) {
    return { type: 'corrupt', reason: 'Missing or invalid required field: rules' };
  }
  if (
    !effectiveLogic.serviceCatalog ||
    typeof effectiveLogic.serviceCatalog !== 'object' ||
    !Array.isArray(effectiveLogic.serviceCatalog.treatments) ||
    effectiveLogic.serviceCatalog.treatments.length === 0
  ) {
    return { type: 'corrupt', reason: 'Missing or invalid required field: serviceCatalog (must have treatments array with at least one item)' };
  }

  const logic: StructuredLogic = {
    ...effectiveLogic,
    toolOrchestration: reconcileFlowSelections(effectiveLogic.toolOrchestration),
  };

  return { type: 'success', logic };
}

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const parts = keys.map(
      (k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`,
    );
    return `{${parts.join(',')}}`;
  }
  return 'undefined';
}

/**
 * Deterministic hash of a StructuredLogic object for cache keys.
 * Uses stable key ordering so logically equivalent JSON objects produce
 * the same hash regardless of property insertion order.
 */
export function hashStructuredLogic(logic: StructuredLogic): string {
  const text = stableStringify(logic);
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}
