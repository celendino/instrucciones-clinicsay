/**
 * Mode Advisory — canonical mode notes for the builder.
 *
 * Emits advisory gaps (never blocking) so the builder can proactively ask:
 * "In mode X the typical pattern is Y. Is your deviation intentional?"
 *
 * These are NOT personalized comparisons against the advisor's JSON.
 * They are canonical notes about what each mode typically enables.
 */

import type { StructuredLogic, StructuredLogicChatMode } from '../structured-logic';
import { DEFAULT_MAX_VISIBLE_SLOTS } from '../availability/chat-bot-defaults';
import type { LogicGap } from '../validator';

export function detectModeAdvisoryGaps(
  mode: StructuredLogicChatMode,
  logic: StructuredLogic,
): LogicGap[] {
  const gaps: LogicGap[] = [];

  const allTools = new Set<string>();
  const allFlows = Object.values(logic.toolOrchestration?.flows ?? {});
  for (const flow of allFlows) {
    for (const step of flow.steps ?? []) {
      for (const tool of step.tools ?? []) {
        allTools.add(tool);
      }
    }
  }

  const schedulingTools = new Set([
    'check_availability',
    'schedule_block',
    'resolve_patient',
    'resolve_treatment',
    'resolve_professional',
    'resolve_availability_query',
  ]);

  const flowUsesAnyTool = (flow: (typeof allFlows)[number], tools: Set<string>): boolean =>
    [...(flow.allowedTools ?? []), ...(flow.steps ?? []).flatMap((step) => step.tools ?? [])].some(
      (tool) => tools.has(tool),
    );

  // ── Caso F: full + consulta de reagendamiento que MODIFICA la cita ──
  // Consultar disponibilidad ya NO entra aquí: es obligatorio en full (lo exige
  // `validateRescheduleInquiryCanConsultAvailability`). Solo se avisa de las
  // herramientas que modifican, que siguen siendo del flujo operativo.
  const inquiryToolSet = new Set([
    'cancel_for_rescheduling',
    'schedule_block',
    'manage_schedule_block_status',
    'manage_all_schedule_blocks_for_date',
  ]);
  const rescheduleInquiryFlows = allFlows.filter(
    (flow) => flow.intent === 'existing_appointment_reschedule_inquiry',
  );
  if (mode === 'full' && rescheduleInquiryFlows.some((flow) => flowUsesAnyTool(flow, inquiryToolSet))) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'La consulta existing_appointment_reschedule_inquiry debe ser solo informativa. ' +
        'Está mezclada con herramientas que MODIFICAN la cita, mientras que la confirmación explícita debe usar un flujo separado de existing_appointment_rescheduling. ' +
        'Separa ambos flujos para que una pregunta no cancele, mueva ni cree la cita. Consultar disponibilidad sí es correcto ahí: informa sin autorizar a agendar.',
    });
  }

  // ── Caso F2: full + consulta de reagendamiento que no puede consultar ──
  // El validador lo rechaza, así que el aviso llega antes del rechazo y dice
  // exactamente qué falta.
  // El validador exige AMBAS, asi que el aviso se dispara si falta cualquiera.
  const inquiryConsultTools = ['resolve_availability_query', 'check_availability'];
  if (
    mode === 'full' &&
    rescheduleInquiryFlows.some((flow) =>
      inquiryConsultTools.some((tool) => !flowUsesAnyTool(flow, new Set([tool]))),
    )
  ) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'La consulta existing_appointment_reschedule_inquiry no puede mirar la agenda: le falta un paso con ' +
        '"resolve_availability_query" y "check_availability". Sin ellas el flujo se queda sin herramientas, así que en cuanto ' +
        'el paciente da un día u hora el bot solo puede prometer que consultará —prohibido— y la conversación entra en bucle. ' +
        'Añade ese paso de CONSULTA: los huecos que muestre son informativos y no autorizan a agendar.',
    });
  }

  // ── Caso G: rama de no asistencia con herramientas del reagendamiento ──
  const cancellationFlows = allFlows.filter(
    (flow) => flow.intent === 'existing_appointment_cancellation',
  );
  const nonAttendanceForbiddenTools = new Set([
    'cancel_for_rescheduling',
    'resolve_availability_query',
    'check_availability',
    'schedule_block',
  ]);
  if (
    mode === 'full' &&
    cancellationFlows.some((flow) => flowUsesAnyTool(flow, nonAttendanceForbiddenTools))
  ) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'La rama de no asistencia debe cancelar primero con manage_schedule_block_status y ofrecer una nueva cita después de la aceptación del paciente. ' +
        'No uses cancel_for_rescheduling ni herramientas de disponibilidad o reserva antes de esa aceptación; la nueva cita debe continuar en new_appointment_scheduling.',
    });
  }

  // ── Caso A: Modo full + new_appointment_scheduling solo con create_task ──
  if (mode === 'full') {
    const schedulingFlows = allFlows.filter((f) => f.intent === 'new_appointment_scheduling');
    if (schedulingFlows.length > 0) {
      const hasRealScheduling = schedulingFlows.some((f) =>
        (f.steps ?? []).some((s) => s.tools.some((t) => schedulingTools.has(t))),
      );
      if (!hasRealScheduling) {
        gaps.push({
          severity: 'advisory',
          type: 'mode_note',
          description:
            'Para tu información: en modo FULL, el patrón típico para agendar citas es un flujo de new_appointment_scheduling con herramientas de resolución y agendamiento (resolve_patient, resolve_treatment, check_availability, schedule_block) para que el paciente agende directamente sin intervención humana. ' +
            'Tu flujo de new_appointment_scheduling no usa ninguna de estas herramientas. Si tu sede prefiere que recepción valide cada solicitud antes de agendar, está perfecto — solo asegúrate de que la tarea (create_task) incluya toda la información necesaria: nombre, apellido, teléfono, tratamiento y fecha preferida.',
        });
      }
    }
  }

  // ── Caso B: Modo full + no hay schedule_block en ningún flujo ──
  if (mode === 'full' && !allTools.has('schedule_block')) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'Para tu información: en modo FULL lo habitual es incluir "schedule_block" en al menos un flujo de scheduling para que el paciente pueda agendar citas directamente. ' +
        'En tu configuración actual no se encuentra "schedule_block". Si tu clínica prefiere que todas las citas pasen por recepción (modelo tarea humana), quizá el modo "tasks-only" describa mejor tu operativa. Si lo dejas en full, no pasa nada — el bot seguirá funcionando con las herramientas que tengas configuradas.',
    });
  }

  // ── Caso C: Modo tasks-only + resolve_patient o resolve_treatment presente ──
  if (mode === 'tasks-only' && (allTools.has('resolve_patient') || allTools.has('resolve_treatment'))) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'Para tu información: en modo TASKS-ONLY no es típico usar resolve_patient ni resolve_treatment porque no se agendan citas directamente. ' +
        'Si los incluyes en tus flujos, asegúrate de que es intencional (por ejemplo, para que la tarea humana ya tenga el patientId identificado y no tenga que volver a preguntar). Si no los necesitas, puedes simplificar el flujo quitándolos.',
    });
  }

  // ── Caso D: Modo tasks-only + regla new_appointment_scheduling sin redirectToTask ──
  if (mode === 'tasks-only') {
    const schedulingRules = (logic.rules ?? []).filter((r) => r.intent === 'new_appointment_scheduling');
    if (schedulingRules.length > 0) {
      const anyHasRedirect = schedulingRules.some((r) => r.redirectToTask === true);
      if (!anyHasRedirect) {
        gaps.push({
          severity: 'advisory',
          type: 'mode_note',
          description:
            'Para tu información: en modo TASKS-ONLY lo común es que las reglas de new_appointment_scheduling tengan redirectToTask: true, porque este modo no permite agendar citas reales (no tiene check_availability ni schedule_block). ' +
            'Si tu regla no tiene redirectToTask, el bot responderá sin crear tarea humana. Está bien si prefieres una respuesta informativa — solo asegúrate de que el paciente tenga claro cuál es su siguiente paso y que no quede esperando una acción del bot.',
        });
      }
    }
  }

  // ── Caso H: tasks-only + maxVisibleSlots/globalSchedulingPolicies configurados ──
  // En tasks-only el bot no agenda (no hay check_availability ni schedule_block),
  // así que estas preferencias nunca se aplican. Solo avisar cuando se desvían del
  // default (9 / []): el default no es una decisión consciente de la sede.
  if (mode === 'tasks-only') {
    const hasCustomMaxVisibleSlots =
      logic.maxVisibleSlots !== undefined && logic.maxVisibleSlots !== DEFAULT_MAX_VISIBLE_SLOTS;
    const hasSchedulingPolicies = (logic.globalSchedulingPolicies ?? []).length > 0;
    if (hasCustomMaxVisibleSlots || hasSchedulingPolicies) {
      gaps.push({
        severity: 'advisory',
        type: 'mode_note',
        description:
          'Para tu información: en modo TASKS-ONLY el bot no agenda citas, así que maxVisibleSlots y globalSchedulingPolicies no se aplican en la conversación. ' +
          'Se conservan en el JSON por si la sede cambia a modo full en el futuro, pero mientras el modo sea tasks-only no tienen efecto.',
      });
    }
  }

  // ── Caso E: Cualquier modo + create_task SIN resolve_patient ni lookup_patient ──
  if (allTools.has('create_task') && !allTools.has('resolve_patient') && !allTools.has('lookup_patient')) {
    gaps.push({
      severity: 'advisory',
      type: 'mode_note',
      description:
        'Para tu información: la herramienta create_task SIEMPRE requiere nombre, apellido y número de teléfono del paciente para que recepción pueda contactarlo y gestionar la solicitud. ' +
        'En tu configuración actual no veo resolve_patient ni lookup_patient en ningún flujo. Esto está bien si el paciente ya se identifica de otra forma (por ejemplo, porque viene de un flujo previo donde ya se pidieron los datos). Si no, asegúrate de que create_task reciba esos datos de alguna manera, o incluye una nota en el flujo para que el bot los pida explícitamente antes de crear la tarea.',
    });
  }

  return gaps;
}
