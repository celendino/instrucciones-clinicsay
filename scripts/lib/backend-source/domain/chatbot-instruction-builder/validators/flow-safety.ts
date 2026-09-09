/**
 * Flow Safety — configuration-time guards against advisor-authored flows that
 * are dangerous or silently broken at runtime.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `full` and `tasks-only` are only LIMITS (which tools exist at all). The
 * advisor decides, in the chatbot instruction builder JSON, WHICH steps run,
 * IN WHICH ORDER and WITH WHICH TOOLS. The backend therefore cannot assume any
 * particular flow shape — it can only reject shapes that are provably unsafe.
 *
 * Two of those shapes caused a production incident (lead 23415677):
 *
 *  1. The old reschedule flow cancelled the patient's appointment in step 1, in
 *     PARALLEL with resolving the requested dates — i.e. before any
 *     alternative existed. When no slot matched, the patient was left with no
 *     appointment at all. Irrecoverable business data loss.
 *  2. The closing template ("He movido tu cita") was reachable from a flow
 *     whose terminal step was a SEARCH tool, so the model announced the move
 *     right after merely listing availability.
 *
 * Both are configuration mistakes, so they are rejected here — loudly, at
 * configuration time — instead of being silently patched at runtime. Messages
 * are written in Spanish and addressed to a non-technical advisor: what is
 * wrong, why it is dangerous, and how to fix it.
 *
 * Pure functions, no I/O.
 */

import {
  CANONICAL_INTENTS,
  EXISTING_APPOINTMENT_INTENTS,
  RESERVED_INTENT_NAMESPACES,
  isCanonicalIntent,
  isReschedulingIntent,
  usesReservedIntentNamespace,
} from '../../chat/canonical-intents';
import type {
  StructuredLogic,
  StructuredLogicChatMode,
  ToolFlow,
} from '../../chat/structured-logic';

/** Tool that destroys an existing appointment (action `cancel`). */
const DESTRUCTIVE_TOOL = 'manage_schedule_block_status';

/** Tool that creates the replacement appointment. */
const CONSTRUCTIVE_TOOL = 'schedule_block';

/** Tool that cancels/confirms EVERY appointment the patient has on a date. */
const BULK_DESTRUCTIVE_TOOL = 'manage_all_schedule_blocks_for_date';

/**
 * Tools that WRITE on the patient's appointments: they create, move or destroy
 * them. Every other chat tool (`check_availability`, `resolve_*`,
 * `lookup_patient`, `query_*`, `create_task`) only reads or produces work for a
 * human, so it carries no appointment-safety semantics.
 *
 * Their presence is what forces a flow to carry a canonical intent, and — when
 * that intent is `existing_appointment_*` — what forces the
 * `hasActiveAppointment` gate.
 */
const APPOINTMENT_WRITING_TOOLS = [CONSTRUCTIVE_TOOL, DESTRUCTIVE_TOOL, BULK_DESTRUCTIVE_TOOL];

/**
 * Herramientas que MODIFICAN la cita. Prohibidas en una consulta de
 * reagendamiento: preguntar si es posible mover una cita no puede cancelarla,
 * moverla ni crearla.
 *
 * CONSULTAR disponibilidad (`check_availability`, `resolve_availability_query`)
 * SÍ está permitido y es deliberado: sin ello, en cuanto el paciente da una fecha
 * el bot se queda sin herramientas y lo único que puede hacer es PROMETER que
 * mirará la agenda — algo prohibido por el validador de respuesta, lo que produjo
 * un bucle en producción (19-08-2026). Los huecos consultados aquí van a
 * `inquirySlots` y no habilitan a agendar: `hasShownSlots` sigue false, así que
 * `tool-call-policy` rechaza `schedule_block` hasta que la conversación escala al
 * flujo operativo y los promueve.
 */
const RESCHEDULE_INQUIRY_REQUIRED_TOOLS = ['resolve_reschedule_target', 'resolve_availability_query', 'check_availability'];
const RESCHEDULE_PATIENT_TOOL = 'resolve_patient';

const RESCHEDULE_INQUIRY_FORBIDDEN_TOOLS = [
  'cancel_for_rescheduling',
  CONSTRUCTIVE_TOOL,
  DESTRUCTIVE_TOOL,
  BULK_DESTRUCTIVE_TOOL,
];

const APPOINTMENT_WRITING_TOOLS_TEXT = APPOINTMENT_WRITING_TOOLS.join('", "');

/** Deterministic gate proving the patient really has an appointment to act on. */
const ACTIVE_APPOINTMENT_CAPABILITY = 'hasActiveAppointment';
const CANCELLED_TARGET_CAPABILITY = 'hasCancelledRescheduleTarget';

/** Literal responses are reserved for deterministic appointment operations. */
const LITERAL_APPOINTMENT_INTENTS = new Set([
  'existing_appointment_confirmation',
  'existing_appointment_cancellation',
  'existing_appointment_delay_notice',
]);

/**
 * Flow safety rules stated for the LLMs that draft the JSON with the advisor.
 *
 * Single source of truth: the builder prompts embed this text so the model is
 * told the same rules that `validateFlowSafety` enforces. Keep both in sync.
 */
export const FLOW_SAFETY_PROMPT_RULES =
  `FLOW SAFETY RULES (the backend validator REJECTS the JSON when any of these is violated):\n` +
  `S1. In a full reschedule flow (intent "existing_appointment_rescheduling") that includes "schedule_block", ` +
  `the preparatory tool MUST be "cancel_for_rescheduling". "manage_schedule_block_status" is NOT a preparatory tool in this flow; ` +
  `use it only for definitive cancellation, confirmation, or EN_ROUTE actions in their respective flows. ` +
  `Conversely, "cancel_for_rescheduling" is ONLY valid in rescheduling flows: definitive cancellation, confirmation ` +
  `and EN_ROUTE flows MUST use "manage_schedule_block_status" instead.\n` +
  `S2. The mandatory full reschedule order is resolve_patient (when needed) -> patientTarget -> resolve_reschedule_target -> cancel_for_rescheduling -> resolve_availability_query -> check_availability -> schedule_block. ` +
  `The appointment is released preparatorily BEFORE the new date is asked or consulted; resolve_availability_query and check_availability require the cancelled target and resolved dates. "check_availability" NEVER runs without concrete dates: ` +
  `the resolve step is REQUIRED so the bot asks for the missing date or time. ` +
  `schedule_block also requires availability evidence from the CURRENT turn; inherited slots never authorize booking. ` +
  `If the chosen time is occupied, report that it is no longer available and offer real alternatives, never an expiration explanation. ` +
  `The first tool captures a validated backend target; it is not a definitive cancellation and the final booking reuses the persisted ` +
  `care plan and planned sessions.\n` +
  `S3. A full reschedule flow that includes "schedule_block" MUST include all seven tools in the deterministic order, and ` +
  `the resolve_reschedule_target step must require patientTarget before the appointment target can be used.\n` +
  `S4. "responseTemplateKey" is an optional, denotative reference to the "responseTemplates" registry; it is never patient-facing text. ` +
  `The registry contains the patient-facing text and mode. Do not require a key for any flow, tool, step, or terminal step. ` +
  `When the key is absent, the backend logs the absence and the response uses patientOutcome when available or the AI generates it from context.\n` +
  `S5. Never expose responseTemplateKey values, registry names, tool names, field names, IDs, or other technical identifiers to the patient. ` +
  `Response rendering is independent of step position; steps only describe tool execution order.\n` +
  `S6. Write the "steps" array in execution order: its numbering must be ascending (1, 2, 3...).\n` +
  `S7. Intent ids are FREE except inside two RESERVED namespaces. The clinic owns its conversation: ids like ` +
  `"insurance_coverage_inquiry", "parking_info" or "physio_program_followup" are perfectly valid in "intents" and in ` +
  `"flow.intent", and no rule complains about them. What is CLOSED are the prefixes "new_appointment_" and ` +
  `"existing_appointment_": an id starting with either MUST be one of the canonical ids: ${CANONICAL_INTENTS.join(', ')}. ` +
  `An invented "existing_appointment_moving" LOOKS like rescheduling but is not recognised by the safety rules nor by the ` +
  `server-side guards, so the protection would be silently off. Convention: "new_appointment_*" when the patient does not have ` +
  `the appointment yet, "existing_appointment_*" when the flow reads, moves, confirms, keeps or destroys an appointment the ` +
  `patient already has.\n` +
  `S7b. A flow that CREATES, MOVES or DESTROYS appointments (it uses "${APPOINTMENT_WRITING_TOOLS_TEXT}", in "steps" or in ` +
  `"allowedTools") MUST declare a canonical "intent", even if the flow name is the clinic's own. That flow carries safety ` +
  `semantics and the guards need to classify it. A flow with a free intent and no appointment-writing tools (only ` +
  `"query_knowledge_base", "create_task", "lookup_patient", "check_availability", resolvers...) is valid.\n` +
  `S8. A flow whose intent is "existing_appointment_*" AND that uses an appointment-writing tool MUST ` +
  `declare "selection": { "requiredCapabilities": ["hasActiveAppointment"] }. Without that deterministic gate a bare "sí" can ` +
  `select the flow when the patient has no appointment at all, and the bot acts on an appointment that does not exist. ` +
  `Informational flows (no tools) do not need the gate.\n` +
  `S9. Conversational response templates MUST use model mode. ` +
  `responseTemplates.<key>.mode: "literal" is allowed ONLY for ` +
  `existing_appointment_confirmation, existing_appointment_cancellation, and existing_appointment_delay_notice ` +
  `(confirmation, definitive cancellation, or EN_ROUTE/late notices). A literal mode on an inquiry, farewell, ` +
  `booking, rescheduling, handoff, or informational flow is rejected because it forces a rigid response without ` +
  `adapting to the conversation.\n` +
  `S10. In full mode, a flow whose intent is "existing_appointment_reschedule_inquiry" MUST declare a step with ` +
  `"tools": ["${RESCHEDULE_INQUIRY_REQUIRED_TOOLS.join('", "')}"]. Without them the flow has NO tools at all, so the moment the ` +
  `patient gives a day or a time the bot can only PROMISE to look at the schedule — which is rejected and replaced by a canonical ` +
  `message, advancing nothing, so the patient insists and the bot repeats itself forever. This is CONSULTING, not modifying: the ` +
  `slots it shows are informational and do not authorize booking, and the tools that modify the appointment stay forbidden here. ` +
  `In tasks-only mode this flow declares no tools and the rule does not apply.\n`;

/** Shared semantic contract used by all builder prompts for appointment flows. */
export const RESCHEDULING_SEMANTIC_PROMPT_RULES =
  `RESCHEDULING SEMANTIC RULES (apply these meanings before choosing intents, flows, or tools):\n` +
  `R1. An informational reschedule inquiry asks whether an existing appointment can be rescheduled, without confirming the change. ` +
  `Use canonical intent "existing_appointment_reschedule_inquiry". In full mode it MUST be able to check availability — declare a step with ` +
  `"tools": ["resolve_availability_query", "check_availability"] — so it can tell the patient what options actually exist. Without them the ` +
  `flow has no tools at all and the bot can only PROMISE a search, which is rejected and loops. It must still never cancel, move or book, ` +
  `never promise a future search (check and report instead), and never claim the appointment changed. In tasks-only mode it declares no tools.\n` +
  `R2. An explicit rescheduling confirmation clearly agrees to move the existing appointment. Use canonical intent "existing_appointment_rescheduling" ` +
  `and a separate "reschedule_appointment" flow for the real operation; an inquiry must never be silently upgraded.\n` +
  `R3. definitive non-attendance cancellation means the patient will not attend and wants the existing appointment cancelled, not moved. ` +
  `Use canonical intent "existing_appointment_cancellation" and "manage_schedule_block_status", not "cancel_for_rescheduling"; do not check availability before a new appointment is accepted.\n` +
  `R4. A new appointment after cancellation is a new scheduling request. Use canonical intent "new_appointment_scheduling" and a separate new-appointment flow; never reuse the rescheduling target.\n` +
  `R5. Full and tasks-only are different contracts. In full mode, explicit rescheduling may use availability and appointment tools and must follow the validated full order. In tasks-only mode, do not generate scheduling, rebooking, or availability tools; scheduling requests use "create_task" for human follow-up. Definitive cancellation remains allowed through "manage_schedule_block_status".\n` +
  `R6. Preserve canonical intents exactly. Use verbose internal states such as "PATIENT_ONLY_ASKED_IF_EXISTING_APPOINTMENT_CAN_BE_RESCHEDULED_WITHOUT_CONFIRMING_RESCHEDULING", "PATIENT_EXPLICITLY_CONFIRMED_EXISTING_APPOINTMENT_RESCHEDULING_BEFORE_NEW_DATE_OR_TIME", "EXISTING_APPOINTMENT_WAS_CANCELLED_BECAUSE_PATIENT_WILL_NOT_ATTEND_AND_BOT_IS_OFFERING_A_NEW_APPOINTMENT", and "PATIENT_ACCEPTED_NEW_APPOINTMENT_AFTER_CANCELLING_PREVIOUS_APPOINTMENT" only as internal conversational states, never as new intent ids.\n` +
  `R7. Keep "reschedule_inquiry" and "reschedule_appointment" separate: the first answers whether a change is possible, may show real availability, and requests confirmation; the second performs the confirmed operation. Slots shown during the inquiry are informational and do not authorize booking.\n` +
  `R8. A short affirmative inherits meaning from persisted state: after a reschedule-confirmation question in state PATIENT_ONLY_ASKED_IF_EXISTING_APPOINTMENT_CAN_BE_RESCHEDULED_WITHOUT_CONFIRMING_RESCHEDULING, "sí" means explicit reschedule confirmation and transitions to PATIENT_EXPLICITLY_CONFIRMED_EXISTING_APPOINTMENT_RESCHEDULING_BEFORE_NEW_DATE_OR_TIME; after non-attendance cancellation in state EXISTING_APPOINTMENT_WAS_CANCELLED_BECAUSE_PATIENT_WILL_NOT_ATTEND_AND_BOT_IS_OFFERING_A_NEW_APPOINTMENT, "sí" means acceptance of a new appointment and transitions to PATIENT_ACCEPTED_NEW_APPOINTMENT_AFTER_CANCELLING_PREVIOUS_APPOINTMENT.\n` +
  `R9. A rescheduling target continues only inside a trusted conversation context. distant starts a new conversation and discards the target, operational intent, inherited slots, and prior availability. The active contract has no expiresAt field.\n`;

function toolsOf(step: { tools?: string[] } | undefined): string[] {
  return Array.isArray(step?.tools) ? step!.tools : [];
}

function stepsOf(flow: ToolFlow): Array<{ step: number; tools: string[]; parallel?: boolean }> {
  return Array.isArray(flow.steps)
    ? (flow.steps as Array<{ step: number; tools: string[]; parallel?: boolean }>)
    : [];
}

/** First array position (execution position) whose step declares `tool`. */
function firstPositionWith(flow: ToolFlow, tool: string): number {
  return stepsOf(flow).findIndex((step) => toolsOf(step).includes(tool));
}

function flowUsesTool(flow: ToolFlow, tool: string): boolean {
  const inAllowed = Array.isArray(flow.allowedTools) && flow.allowedTools.includes(tool);
  return inAllowed || firstPositionWith(flow, tool) >= 0;
}

function header(flowName: string, flow: ToolFlow): string {
  return `Flujo "${flowName}" (intención "${flow.intent}")`;
}

function inAllowedTools(flow: ToolFlow, tool: string): boolean {
  return Array.isArray(flow.allowedTools) && flow.allowedTools.includes(tool);
}

/**
 * A destructive tool must never run before — or alongside — the tool that
 * creates its replacement.
 *
 * ORDER CAN ONLY BE READ FROM `steps`. `allowedTools` is an UNORDERED whitelist:
 * a tool that lives only there may be called at any moment of the flow, so it
 * carries no guarantee whatsoever. That asymmetry is what separates the safe
 * shape from the dangerous one:
 *
 *  - SAFE (the shipped default): the cancellation lives ONLY in `allowedTools`
 *    and `schedule_block` is a numbered step. Booking is anchored in the
 *    ordered part of the flow and the cancellation is additionally blocked
 *    server-side until the new appointment exists.
 *  - DANGEROUS: the cancellation is a numbered step and the ONLY way to book
 *    lives in `allowedTools`. The destruction is scheduled, the construction is
 *    not — nothing forces the booking to happen first, or at all.
 */
function validateDestructiveOrder(flowName: string, flow: ToolFlow, errors: string[]): void {
  const steps = stepsOf(flow);
  const cancelPos = firstPositionWith(flow, DESTRUCTIVE_TOOL);
  const schedulePos = firstPositionWith(flow, CONSTRUCTIVE_TOOL);
  const usesCancel = cancelPos >= 0 || inAllowedTools(flow, DESTRUCTIVE_TOOL);
  const usesSchedule = schedulePos >= 0 || inAllowedTools(flow, CONSTRUCTIVE_TOOL);

  // A flow that cannot do both things has no ordering problem: either it never
  // destroys anything, or `validateRescheduleCanRebook` reports the missing
  // constructive counterpart.
  if (!usesCancel || !usesSchedule) return;

  const cancelStepNumber = steps[cancelPos]?.step ?? cancelPos + 1;
  const scheduleStepNumber = steps[schedulePos]?.step ?? schedulePos + 1;

  const why =
    `POR QUÉ ES PELIGROSO: si la búsqueda no encuentra hueco, si el paciente no elige ninguno ` +
    `o si abandona la conversación, la cita antigua ya está cancelada y el paciente se queda SIN CITA. ` +
    `Es una pérdida de datos irrecuperable y ya ocurrió en producción.`;
  const how =
    `CÓMO SE CORRIGE: coloca "${CONSTRUCTIVE_TOOL}" en un paso ANTERIOR al de "${DESTRUCTIVE_TOOL}". ` +
    `En un flujo de reprogramación usa "cancel_for_rescheduling" como paso preparatorio. ` +
    `Nunca pongas las dos herramientas en el mismo paso ni con "parallel": true.`;

  // Both tools are ordered steps: compare their execution positions below.
  if (cancelPos >= 0 && schedulePos >= 0) {
    validateOrderedPositions(flowName, flow, errors, {
      cancelPos,
      schedulePos,
      cancelStepNumber,
      scheduleStepNumber,
      why,
      how,
    });
    return;
  }

  // The cancellation is a numbered step but booking only exists in the
  // unordered whitelist: the destruction is scheduled and the construction is
  // not. This is the shape that escaped the original ordering rule.
  if (cancelPos >= 0) {
    errors.push(
      `${header(flowName, flow)}: el paso ${cancelStepNumber} CANCELA la cita ("${DESTRUCTIVE_TOOL}"), pero la única forma de ` +
        `AGENDAR la nueva ("${CONSTRUCTIVE_TOOL}") está en "allowedTools", que es una lista SIN ORDEN. ` +
        `Nada garantiza que se agende antes de cancelar, ni siquiera que se agende. ` +
        `${why} ${how}`,
    );
    return;
  }

  // The cancellation lives only in `allowedTools`. If booking is a numbered
  // step, this is the safe shape: nothing to report.
  if (schedulePos >= 0) return;

  // Neither tool is a numbered step: the whole move is unordered. Harmless for
  // flows that merely have both tools available, dangerous for a flow whose
  // very purpose is moving an appointment.
  if (isReschedulingIntent(flow.intent)) {
    errors.push(
      `${header(flowName, flow)}: es un flujo de reagendamiento que puede CANCELAR ("${DESTRUCTIVE_TOOL}") y AGENDAR ` +
        `("${CONSTRUCTIVE_TOOL}"), pero ninguna de las dos herramientas aparece en ningún paso numerado: ambas viven solo en ` +
        `"allowedTools", que es una lista SIN ORDEN. ${why} ` +
        `CÓMO SE CORRIGE: declara "${CONSTRUCTIVE_TOOL}" como paso final de "steps" (resolver fechas → buscar huecos → agendar) ` +
        `y deja "${DESTRUCTIVE_TOOL}" en "allowedTools" como último movimiento; el servidor bloquea esa cancelación ` +
        `mientras la cita nueva no exista.`,
    );
  }
}

function validateOrderedPositions(
  flowName: string,
  flow: ToolFlow,
  errors: string[],
  args: {
    cancelPos: number;
    schedulePos: number;
    cancelStepNumber: number;
    scheduleStepNumber: number;
    why: string;
    how: string;
  },
): void {
  const steps = stepsOf(flow);
  const { cancelPos, schedulePos, cancelStepNumber, scheduleStepNumber, why, how } = args;

  if (cancelPos === schedulePos) {
    const parallel = steps[cancelPos]?.parallel === true;
    errors.push(
      `${header(flowName, flow)}: el paso ${cancelStepNumber} CANCELA la cita ("${DESTRUCTIVE_TOOL}") y AGENDA la nueva ` +
        `("${CONSTRUCTIVE_TOOL}") en el mismo paso${parallel ? ' con "parallel": true' : ''}, así que no hay ningún orden garantizado entre las dos. ` +
        `${why} ${how}`,
    );
    return;
  }

  if (cancelPos < schedulePos) {
    errors.push(
      `${header(flowName, flow)}: el paso ${cancelStepNumber} CANCELA la cita ("${DESTRUCTIVE_TOOL}") antes del paso ` +
        `${scheduleStepNumber}, que es el que AGENDA la nueva ("${CONSTRUCTIVE_TOOL}"). ` +
        `${why} ${how}`,
    );
  }
}

/**
 * A reschedule flow that can cancel must also be able to book the replacement.
 */
function validateRescheduleCanRebook(
  flowName: string,
  flow: ToolFlow,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  if (mode !== 'full') return;
  if (!isReschedulingIntent(flow.intent)) return;
  if (!flowUsesTool(flow, DESTRUCTIVE_TOOL)) return;
  if (flowUsesTool(flow, CONSTRUCTIVE_TOOL)) return;

  errors.push(
    `${header(flowName, flow)}: puede CANCELAR la cita ("${DESTRUCTIVE_TOOL}") pero sin ninguna forma de agendar la nueva, ` +
      `porque "${CONSTRUCTIVE_TOOL}" no aparece ni en los pasos ni en "allowedTools". ` +
      `POR QUÉ ES PELIGROSO: reagendar sin poder agendar equivale a cancelar; el paciente se queda sin cita. ` +
      `CÓMO SE CORRIGE: añade "${CONSTRUCTIVE_TOOL}" al flujo (en un paso anterior a la cancelación), ` +
      `o quita "${DESTRUCTIVE_TOOL}" y trata la petición como una cancelación normal.`,
  );
}

/**
 * The terminal step is the LAST element of the array, so the array order must
 * match the declared execution order.
 */
function validateStepArrayOrder(flowName: string, flow: ToolFlow, errors: string[]): void {
  const steps = stepsOf(flow);
  if (steps.length < 2) return;

  const numbers = steps.map((step) => step.step);
  const isAscending = numbers.every((value, index) => index === 0 || numbers[index - 1] < value);
  if (isAscending) return;

  errors.push(
    `${header(flowName, flow)}: los pasos están escritos en un orden distinto a su numeración (${numbers.join(', ')}). ` +
      `POR QUÉ ES PELIGROSO: el sistema considera paso final el ÚLTIMO de la lista, no el de número más alto, ` +
      `así que la plantilla de cierre y el orden de ejecución se aplican al paso equivocado. ` +
      `CÓMO SE CORRIGE: escribe los pasos en la lista en el mismo orden en que deben ejecutarse (1, 2, 3...).`,
  );
}

/**
 * Tokens that appear in almost every appointment intent and therefore carry no
 * discriminating power when suggesting a canonical replacement.
 */
const NON_DISCRIMINATING_TOKENS = new Set([
  'appointment',
  'appointments',
  'cita',
  'citas',
  'new',
  'existing',
  'patient',
  'request',
  'flow',
]);

/**
 * Canonical ids that look like the unknown one, so the advisor gets a concrete
 * replacement instead of a wall of options. Falls back to the full list when no
 * id is recognisably close.
 */
function suggestCanonicalIntents(unknownIntent: string): readonly string[] {
  const stems = unknownIntent
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !NON_DISCRIMINATING_TOKENS.has(token))
    .map((token) => token.slice(0, 6));

  const scored = CANONICAL_INTENTS.map((candidate) => ({
    candidate,
    score: stems.filter((stem) => candidate.includes(stem)).length,
  })).filter((entry) => entry.score > 0);

  if (scored.length === 0) return CANONICAL_INTENTS;

  return scored
    .sort((a, b) => b.score - a.score || a.candidate.localeCompare(b.candidate))
    .slice(0, 6)
    .map((entry) => entry.candidate);
}

const RESERVED_NAMESPACES_TEXT = RESERVED_INTENT_NAMESPACES.map((prefix) => `"${prefix}"`).join(
  ' y ',
);

const RESERVED_NAMESPACE_WHY =
  `POR QUÉ ES PELIGROSO: los prefijos ${RESERVED_NAMESPACES_TEXT} están RESERVADOS para la taxonomía canónica. ` +
  `Un identificador inventado dentro de ellos PARECE de citas (por ejemplo "existing_appointment_moving" parece un ` +
  `reagendamiento), pero no coincide con ninguna de las reglas de seguridad ni con los guards del servidor, ` +
  `así que la protección se apaga en silencio y el error solo aparece cuando ya ha causado daño.`;

function reservedNamespaceHow(unknownIntent: string): string {
  return (
    `CÓMO SE CORRIGE: sustitúyela por la intención canónica equivalente. ` +
    `Parecidas: ${suggestCanonicalIntents(unknownIntent).join(', ')}. ` +
    `Si lo que quieres describir NO es una acción sobre una cita, renómbrala sin esos prefijos: fuera de ellos eres libre ` +
    `de inventar las intenciones que necesite tu clínica (por ejemplo "insurance_coverage_inquiry" o "parking_info").`
  );
}

/**
 * Rule 1 — an id inside a reserved namespace must be canonical.
 *
 * Outside those namespaces the advisor owns the vocabulary: a free id is a
 * conversational intent of the clinic and is accepted without comment.
 */
function reservedNamespaceError(id: string, where: string): string | undefined {
  if (isCanonicalIntent(id)) return undefined;
  if (!usesReservedIntentNamespace(id)) return undefined;

  return (
    `${where}: el identificador "${id}" usa un prefijo RESERVADO pero no pertenece a la taxonomía canónica de intenciones. ` +
    `${RESERVED_NAMESPACE_WHY} ${reservedNamespaceHow(id)}`
  );
}

/**
 * Canonical intents that fit what the flow actually does, so the message names
 * the replacement instead of listing the whole taxonomy.
 */
function canonicalIntentsForTools(writingTools: string[]): readonly string[] {
  const creates = writingTools.includes(CONSTRUCTIVE_TOOL);
  const destroys =
    writingTools.includes(DESTRUCTIVE_TOOL) || writingTools.includes(BULK_DESTRUCTIVE_TOOL);

  if (creates && destroys) return ['existing_appointment_rescheduling'];
  if (creates) return ['new_appointment_scheduling', 'existing_appointment_rescheduling'];
  return [
    'existing_appointment_cancellation',
    'existing_appointment_confirmation',
    'existing_appointment_delay_notice',
  ];
}

/**
 * Rules 1 and 3 for `flow.intent`.
 *
 * A free intent is legitimate — the advisor's clinic, the advisor's
 * conversation — UNLESS the flow claims a reserved namespace (rule 1) or writes
 * on appointments (rule 3), in which case the guards must be able to classify
 * it and only a canonical id can be classified.
 */
function validateFlowIntentIsClassifiable(
  flowName: string,
  flow: ToolFlow,
  errors: string[],
): void {
  const intent = String(flow.intent ?? '');

  const reserved = reservedNamespaceError(intent, header(flowName, flow));
  if (reserved) {
    errors.push(reserved);
    return;
  }

  if (isCanonicalIntent(flow.intent)) return;

  const writingTools = APPOINTMENT_WRITING_TOOLS.filter((tool) => flowUsesTool(flow, tool));
  if (writingTools.length === 0) return; // Rule 2: free conversational intent.

  errors.push(
    `${header(flowName, flow)}: crea, mueve o destruye citas (${writingTools.join(', ')}), pero su intención "${intent}" ` +
      `no pertenece a la taxonomía canónica. ` +
      `POR QUÉ ES PELIGROSO: las reglas de seguridad y los guards del servidor (orden destructivo, puerta de cita activa, ` +
      `bloqueo de la cancelación hasta que exista la cita nueva) clasifican los flujos por su intención. Con una intención ` +
      `libre ninguna de esas protecciones reconoce el flujo, así que se apagan en silencio justo en el flujo que sí puede ` +
      `dejar al paciente sin cita. ` +
      `CÓMO SE CORRIGE: por lo que hace este flujo, la intención canónica que le corresponde es ` +
      `${canonicalIntentsForTools(writingTools).join(' o ')}. ` +
      `Si en realidad no debe tocar la cita del paciente, quita las herramientas ${writingTools.join(', ')} y conserva tu ` +
      `intención propia.`,
  );
}

/**
 * Rule 1 on the catalog the classifier is offered. Free ids are valid: the
 * classifier returning `parking_info` reaches no safety rule and none is
 * needed. A reserved-prefix id that is not canonical is not.
 */
function validateIntentCatalogNamespaces(sl: Partial<StructuredLogic>, errors: string[]): void {
  const intents = sl.intents;
  if (!intents || typeof intents !== 'object' || Array.isArray(intents)) return;

  for (const intentId of Object.keys(intents)) {
    const error = reservedNamespaceError(intentId, `intents["${intentId}"]`);
    if (error) errors.push(error);
  }
}

/**
 * A flow that WRITES on an appointment the patient already has must declare the
 * deterministic gate. Blocking, not advisory: the gate is the only thing that
 * stops a bare "sí" from acting on an appointment that does not exist, and it
 * is now trustworthy (the date-format bug that neutered it is fixed).
 */
function validateActiveAppointmentGate(flowName: string, flow: ToolFlow, errors: string[]): void {
  if (!isCanonicalIntent(flow.intent) || !EXISTING_APPOINTMENT_INTENTS.has(flow.intent)) return;

  const mutatingTools = APPOINTMENT_WRITING_TOOLS.filter((tool) => flowUsesTool(flow, tool));
  if (mutatingTools.length === 0) return;

  const required = flow.selection?.requiredCapabilities;
  if (Array.isArray(required) && required.includes(ACTIVE_APPOINTMENT_CAPABILITY)) return;

  errors.push(
    `${header(flowName, flow)}: actúa sobre una cita que el paciente YA tiene y la modifica ` +
      `(${mutatingTools.join(', ')}), pero no declara "selection": { "requiredCapabilities": ["${ACTIVE_APPOINTMENT_CAPABILITY}"] }. ` +
      `POR QUÉ ES PELIGROSO: sin esa puerta determinista el flujo puede seleccionarse cuando el paciente NO tiene ninguna cita activa ` +
      `(por ejemplo con un "sí" suelto), y el bot intenta confirmar, mover o cancelar una cita inexistente o la equivocada. ` +
      `CÓMO SE CORRIGE: añade "selection": { "requiredCapabilities": ["${ACTIVE_APPOINTMENT_CAPABILITY}"] } al flujo; ` +
      `si el flujo solo informa y no debe tocar la cita, quita las herramientas ${mutatingTools.join(', ')}.`,
  );
}

/**
 * En modo full la consulta de reagendamiento DEBE poder mirar la agenda.
 *
 * Sin el par de consulta el flujo declara cero herramientas, y `ResolveActiveFlow`
 * devuelve entonces `availableTools: []` sin fallback: en cuanto el paciente da una
 * fecha, lo unico que el modelo puede hacer es PROMETER que mirara la agenda — algo
 * que el validador de respuesta bloquea siempre. El texto se sustituye por el
 * canonico, ninguna capability avanza y el hilo de OpenAI sigue apuntando a la
 * respuesta original, asi que el modelo repite lo mismo indefinidamente. Ocurrio en
 * produccion el 19-08-2026 (Sede Palma, 6 turnos, 0 llamadas a herramientas).
 *
 * Por eso falla en runtime en vez de avisar: un bot sin este paso arranca pero
 * reproduce el bucle, y el bucle es invisible en los logs de arranque.
 *
 * En tasks-only NO se exige: ese modo no consulta agenda en ningun flujo y la
 * conversacion acaba en una tarea humana.
 */
function validateRescheduleInquiryCanConsultAvailability(
  flowName: string,
  flow: ToolFlow,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  if (mode !== 'full') return;
  if (flow.intent !== 'existing_appointment_reschedule_inquiry') return;

  const missing = RESCHEDULE_INQUIRY_REQUIRED_TOOLS.filter((tool) => !flowUsesTool(flow, tool));
  if (missing.length === 0) return;

  errors.push(
    `${header(flowName, flow)}: es una consulta de reagendamiento en modo full pero no puede consultar ` +
      `la agenda (falta ${missing.join(', ')}). ` +
      `POR QUÉ ES PELIGROSO: sin esas herramientas el flujo se queda sin ninguna, así que en cuanto el ` +
      `paciente da un día o una hora el bot solo puede PROMETER que mirará la agenda — algo prohibido, ` +
      `cuya respuesta se sustituye por el mensaje canónico sin avanzar nada. El paciente insiste y el bot ` +
      `repite lo mismo: bucle infinito, como el del 19-08-2026. ` +
      `CÓMO SE CORRIGE: añade un paso con "tools": ["${RESCHEDULE_INQUIRY_REQUIRED_TOOLS.join('", "')}"]. ` +
      `Es CONSULTA informativa: los huecos que salgan de ahí no autorizan a agendar, así que sigue ` +
      `prohibido cancelar, mover o crear la cita desde este flujo.`,
  );

  const resolverPosition = firstPositionWith(flow, 'resolve_reschedule_target');
  const availabilityPosition = firstPositionWith(flow, 'check_availability');
  if (resolverPosition >= 0 && availabilityPosition >= 0 && resolverPosition > availabilityPosition) {
    errors.push(
      `${header(flowName, flow)}: resolve_reschedule_target debe ejecutarse antes de consultar disponibilidad.`,
    );
  }
}

/**
 * Every full rescheduling flow must expose patient resolution before resolving
 * the appointment. The runtime may omit the call when the DEFAULT patient is
 * unambiguous, but a third party or an ambiguous patient must be resolvable.
 */
function validateFullReschedulingPatientResolution(
  flowName: string,
  flow: ToolFlow,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  if (
    mode !== 'full' ||
    (flow.intent !== 'existing_appointment_rescheduling' &&
      flow.intent !== 'existing_appointment_reschedule_inquiry')
  ) return;

  const patientPosition = firstPositionWith(flow, RESCHEDULE_PATIENT_TOOL);
  const targetPosition = firstPositionWith(flow, 'resolve_reschedule_target');
  const targetStep = stepsOf(flow).find((step) => toolsOf(step).includes('resolve_reschedule_target'));

  if (!inAllowedTools(flow, RESCHEDULE_PATIENT_TOOL)) {
    errors.push(
      `${header(flowName, flow)} en modo full debe incluir "${RESCHEDULE_PATIENT_TOOL}" en "allowedTools". ` +
        `Puede no llamarse cuando hay un unico paciente objetivo DEFAULT, pero debe estar disponible para varios pacientes o terceros.`,
    );
  }
  if (patientPosition < 0 || targetPosition < 0 || patientPosition >= targetPosition) {
    errors.push(
      `${header(flowName, flow)} en modo full debe declarar "${RESCHEDULE_PATIENT_TOOL}" antes de "resolve_reschedule_target".`,
    );
  }
  if (
    targetStep &&
    (!Array.isArray((targetStep as { required?: string[] }).required) ||
      !(targetStep as { required?: string[] }).required?.includes('hasPatientTarget'))
  ) {
    errors.push(
      `${header(flowName, flow)} debe exigir "hasPatientTarget" antes de ejecutar "resolve_reschedule_target".`,
    );
  }
}

function validateRescheduleInquiry(flowName: string, flow: ToolFlow, errors: string[]): void {
  if (flow.intent !== 'existing_appointment_reschedule_inquiry') return;

  const forbidden = RESCHEDULE_INQUIRY_FORBIDDEN_TOOLS.filter((tool) => flowUsesTool(flow, tool));
  if (forbidden.length === 0) return;

  errors.push(
    `${header(flowName, flow)}: es una consulta informativa de reagendamiento, pero usa herramientas ` +
      `que MODIFICAN la cita (${forbidden.join(', ')}). ` +
      `POR QUÉ ES PELIGROSO: la consulta no confirma ningún cambio, así que no puede cancelar, mover ni crear citas. ` +
      `CÓMO SE CORRIGE: quita esas herramientas y déjale solo las de CONSULTA ("resolve_availability_query", ` +
      `"check_availability"), que sí puede usar para informar al paciente de qué opciones hay; ` +
      `reserva las que modifican para "existing_appointment_rescheduling".`
  );
}

/**
 * Un flujo de reprogramación que CANCELA en uno de sus pasos se apaga a sí mismo
 * si su única puerta es `hasActiveAppointment`: en cuanto ejecuta esa
 * cancelación deja de haber cita activa, así que en el turno siguiente ningún
 * flujo casa y el modelo se queda con TODAS las herramientas sueltas, sin pasos
 * ni guardas. Ocurrió en producción el 19-08-2026: el paciente cancelaba, el bot
 * perdía el hilo y acababa inventando fechas.
 *
 * La alternativa `hasCancelledRescheduleTarget` mantiene el flujo vivo mientras
 * haya una reprogramación pendiente en el estado conversacional.
 */
function validateReschedulingSurvivesItsOwnCancellation(
  flowName: string,
  flow: ToolFlow,
  errors: string[],
): void {
  if (flow.intent !== 'existing_appointment_rescheduling') return;
  // Sin cancelación no hay nada que sobrevivir (p. ej. un flujo que solo crea
  // una tarea de seguimiento).
  if (!flowUsesTool(flow, 'cancel_for_rescheduling')) return;

  const required = flow.selection?.requiredCapabilities;
  const gatedOnActiveAppointment =
    Array.isArray(required) && required.includes(ACTIVE_APPOINTMENT_CAPABILITY);
  if (!gatedOnActiveAppointment) return;

  const alternatives = flow.selection?.alternativeRequiredCapabilities;
  if (Array.isArray(alternatives) && alternatives.includes(CANCELLED_TARGET_CAPABILITY)) return;

  errors.push(
    `${header(flowName, flow)}: cancela la cita en uno de sus pasos pero su única puerta es ` +
      `"${ACTIVE_APPOINTMENT_CAPABILITY}". POR QUÉ ES PELIGROSO: al cancelar deja de haber cita activa, ` +
      `así que el propio flujo deja de seleccionarse en el turno siguiente; el bot pierde sus pasos y ` +
      `responde con todas las herramientas disponibles, sin guardas. ` +
      `CÓMO SE CORRIGE: añade "selection": { "requiredCapabilities": ["${ACTIVE_APPOINTMENT_CAPABILITY}"], ` +
      `"alternativeRequiredCapabilities": ["${CANCELLED_TARGET_CAPABILITY}"] } para que el flujo siga vivo ` +
      `mientras haya una reprogramación pendiente.`,
  );
}

function validateFullReschedulingContract(
  flowName: string,
  flow: ToolFlow,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  if (mode !== 'full' || flow.intent !== 'existing_appointment_rescheduling') return;

  const requiredCapabilities = flow.selection?.requiredCapabilities;
  if (!Array.isArray(requiredCapabilities) || !requiredCapabilities.includes(ACTIVE_APPOINTMENT_CAPABILITY)) {
    errors.push(
      `${header(flowName, flow)} en modo full debe declarar "selection.requiredCapabilities" con ` +
        `"${ACTIVE_APPOINTMENT_CAPABILITY}". La reprogramación solo puede actuar sobre una cita activa.`
    );
  }

  // Cancel-first: the appointment is released preparatorily before the new
  // date is asked or consulted, and the booking reuses the persisted target.
  const requiredTools = [
    'resolve_reschedule_target',
    'cancel_for_rescheduling',
    'resolve_availability_query',
    'check_availability',
    'schedule_block',
  ];
  const steps = stepsOf(flow);
  const positions = requiredTools.map((tool) =>
    steps.findIndex((step) => toolsOf(step).includes(tool)),
  );

  if (positions[0] < 0) {
    errors.push(
      `${header(flowName, flow)} en modo full debe incluir "resolve_reschedule_target" antes de ` +
        `"cancel_for_rescheduling"; el foco debe quedar resuelto antes de liberar la cita.`
    );
  }
  if (positions[4] < 0) {
    errors.push(
      `${header(flowName, flow)} en modo full debe incluir "schedule_block" como acción terminal de la reprogramación.`
    );
  }
  if (positions[3] < 0) {
    errors.push(
      `${header(flowName, flow)} en modo full debe incluir "check_availability" antes de "schedule_block".`
    );
  }
  if (positions[2] < 0) {
    errors.push(
      `${header(flowName, flow)} en modo full debe incluir "resolve_availability_query" antes de "check_availability" ` +
        `porque las fechas deben quedar resueltas antes de consultar disponibilidad.`
    );
  }

  const orderedPositions = positions.filter((position) => position >= 0);
  if (
    orderedPositions.length > 1 &&
    orderedPositions.some((position, index) => index > 0 && orderedPositions[index - 1] >= position)
  ) {
    errors.push(
      `${header(flowName, flow)} en modo full debe ordenar ` +
        `resolve_reschedule_target -> cancel_for_rescheduling -> resolve_availability_query -> check_availability -> schedule_block ` +
        `(patientTarget debe estar resuelto antes de resolve_reschedule_target; la cita se libera antes de consultar la agenda).`
    );
  }
}

function validateNonAttendanceCancellation(flowName: string, flow: ToolFlow, errors: string[]): void {
  if (flow.intent !== 'existing_appointment_cancellation') return;

  const forbidden = [
    'cancel_for_rescheduling',
    'resolve_availability_query',
    'check_availability',
    'schedule_block',
  ].filter((tool) => flowUsesTool(flow, tool));
  if (forbidden.length === 0) return;

  errors.push(
    `${header(flowName, flow)} representa la cancelación definitiva por no asistencia, pero usa ` +
      `herramientas de reagendamiento/disponibilidad (${forbidden.join(', ')}). ` +
      `CÓMO SE CORRIGE: antes de que el paciente acepte una nueva cita, usa únicamente ` +
      `"manage_schedule_block_status" para cancelar y ofrece después un flujo separado de ` +
      `"new_appointment_scheduling".`
  );
}

function validateInformationalTemplate(
  flowName: string,
  flow: ToolFlow,
  templates: StructuredLogic['responseTemplates'],
  errors: string[],
): void {
  const templateKey = flow.responseTemplateKey;
  if (flow.intent !== 'existing_appointment_reschedule_inquiry' || !templateKey) return;

  const configured = templates?.[templateKey]?.text;
  const text = (configured ?? templateKey).toLowerCase();
  if (!/(he|hemos|ya|i have|we have|has been).*(mov|cambi|reprogram|agend|reserv)/i.test(text)) return;

  errors.push(
    `${header(flowName, flow)} tiene una plantilla informativa que anuncia que la cita ya fue modificada. ` +
      `CÓMO SE CORRIGE: la plantilla debe explicar que el cambio aún no está confirmado y pedir confirmación, ` +
      `sin afirmar que la cita fue movida, reprogramada o agendada.`
  );
}

function validateResponseTemplateModes(sl: Partial<StructuredLogic>, errors: string[]): void {
  const flows = sl.toolOrchestration?.flows ?? {};
  const templates = sl.responseTemplates ?? {};

  for (const [flowName, flow] of Object.entries(flows)) {
    const templateKey = flow?.responseTemplateKey;
    if (!flow || !templateKey || LITERAL_APPOINTMENT_INTENTS.has(flow.intent)) continue;

    const template = templates[templateKey];
    if (!template || template.mode !== 'literal') continue;

    errors.push(
      `responseTemplates["${templateKey}"] usa mode "literal" en el flow "${flowName}" ` +
        `fuera de una operación de cita permitida. POR QUÉ ES PELIGROSO: puede forzar una respuesta rígida ` +
        `en una conversación informativa o de seguimiento. CÓMO SE CORRIGE: cambia su mode a "model". ` +
        `Literal solo está permitido para confirmación, cancelación definitiva y avisos de llegada tarde/en camino.`,
    );
  }
}

/**
 * Validate advisor-authored flow safety invariants.
 * Every finding is blocking: a silent degradation is worse than a loud error.
 */
export function validateFlowSafety(
  sl: Partial<StructuredLogic>,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  const flows = sl.toolOrchestration?.flows ?? {};

  validateIntentCatalogNamespaces(sl, errors);
  validateResponseTemplateModes(sl, errors);

  for (const [flowName, flow] of Object.entries(flows)) {
    if (!flow || typeof flow !== 'object') continue;

    validateFlowIntentIsClassifiable(flowName, flow, errors);
    validateActiveAppointmentGate(flowName, flow, errors);
    validateRescheduleInquiry(flowName, flow, errors);
    validateRescheduleInquiryCanConsultAvailability(flowName, flow, mode, errors);
    validateFullReschedulingPatientResolution(flowName, flow, mode, errors);
    validateReschedulingSurvivesItsOwnCancellation(flowName, flow, errors);
    validateFullReschedulingContract(flowName, flow, mode, errors);
    validateNonAttendanceCancellation(flowName, flow, errors);
    validateStepArrayOrder(flowName, flow, errors);
    validateDestructiveOrder(flowName, flow, errors);
    validateRescheduleCanRebook(flowName, flow, mode, errors);
    validateInformationalTemplate(flowName, flow, sl.responseTemplates, errors);
  }
}
