/**
 * Chat Bot Defaults — Centralized business policy constants for chatbot scheduling.
 *
 * These values define the default behavior for availability search, booking
 * constraints, and display limits. They can be overridden per site/clinic
 * via ChatBotAIConfig in the future.
 */

/** Minimum hours of lead time required before booking (e.g., 3 = book at least 3h in advance) */
export const DEFAULT_MINIMUM_LEAD_HOURS = 3;

/** Default number of days to search forward for availability */
export const DEFAULT_FORWARD_DAYS = 45;

/** Maximum slots shown per day in chat responses */
export const DEFAULT_MAX_SLOTS_PER_DAY = 3;

/** Default maximum number of visible slots in a chatbot response. */
export const DEFAULT_MAX_VISIBLE_SLOTS = 9;

/**
 * Resolve the visible-slot limit defensively because legacy JSON can bypass the
 * configuration validator at runtime.
 */
export function resolveMaxVisibleSlots(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 50
    ? value
    : DEFAULT_MAX_VISIBLE_SLOTS;
}

/** Maximum days shown in chat responses */
export const DEFAULT_MAX_DAYS = 3;

/** Maximum number of continuous windows to collect before presentation cuts the pool */
export const MAX_TOTAL_WINDOWS = 500;

/**
 * Confianza mínima para aceptar un match semántico sin pedir aclaración.
 *
 * ÚNICA fuente de verdad: la usan tanto el corte en `semantic-match.ts` como el
 * texto de los prompts de `resolve_treatment` y `resolve_professional`. Estuvo
 * duplicada (la constante decía 0.7, los prompts 0.7 y el código cortaba en 0.6),
 * así que un match de 0.65 se marcaba como "necesita aclaración" por el prompt y
 * el código lo aceptaba igual: se agendaba un tratamiento que el propio modelo
 * había dicho que no tenía claro.
 */
export const SEMANTIC_MATCHING_CONFIDENCE_THRESHOLD = 0.6;

/** Default slot policy: every 5 minutes, ending in 00/05/10/15/20/25/30/35/40/45/50/55 */
export const DEFAULT_SLOT_POLICY = {
  minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] as number[],
  interval: 5,
};

/**
 * Default days to search forward when the patient uses an ambiguous date phrase
 * (e.g., "cualquier día", "algún día", "cuando haya"). This is a platform default.
 */
export const DEFAULT_AMBIGUOUS_PHRASE_DAYS = 7;
