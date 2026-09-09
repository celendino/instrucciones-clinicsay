import type { ConversationCapabilities } from '../../../../domain/chat/conversation-state';
import type { ToolFlow } from '../../../../domain/chat/structured-logic';
import { ALL_TOOL_NAMES } from '../../../../domain/chat/tool-names';

export function checkStepRequirements(
  toolName: string,
  toolArguments: Record<string, unknown>,
  activeFlow: ToolFlow | null,
  capabilities: ConversationCapabilities,
  chatMode: 'full' | 'tasks-only',
): { allowed: boolean; reason?: string } {
  if (
    chatMode === 'full' &&
    toolName === 'schedule_block' &&
    !capabilities.hasShownSlots
  ) {
    return {
      allowed: false,
      reason: activeFlow?.intent === 'existing_appointment_rescheduling'
        ? 'Full rescheduling must have shown slots (call check_availability first) before schedule_block.'
        : 'Full booking requires shown slots before schedule_block.',
    };
  }

  if (
    chatMode === 'full' &&
    activeFlow?.intent === 'existing_appointment_rescheduling' &&
    toolName === 'cancel_for_rescheduling' &&
    !capabilities.hasResolvedRescheduleTarget
  ) {
    return {
      allowed: false,
      reason: 'Full rescheduling must resolve_reschedule_target before cancel_for_rescheduling.',
    };
  }

  // Hard gate: patient must be resolved before scheduling in a new appointment.
  if (
    toolName === 'schedule_block' &&
    activeFlow?.intent === 'new_appointment_scheduling' &&
    !capabilities.hasResolvedPatient
  ) {
    return {
      allowed: false,
      reason: 'No se puede agendar sin resolver al paciente. Llama resolve_patient primero y confirma nombre, apellido y telefono.',
    };
  }

  // Hard gate: patient must be resolved before creating a booking task in tasks-only mode.
  if (
    chatMode === 'tasks-only' &&
    toolName === 'create_task' &&
    activeFlow?.intent === 'new_appointment_scheduling' &&
    !capabilities.hasResolvedPatient
  ) {
    return {
      allowed: false,
      reason: 'No se puede crear una tarea de agendamiento sin resolver al paciente. Llama resolve_patient primero y confirma nombre, apellido y telefono.',
    };
  }

  if (!activeFlow) {
    return { allowed: true };
  }

  if (
    activeFlow.intent === 'existing_appointment_reschedule_inquiry' &&
    (toolName === 'check_availability' || toolName === 'resolve_availability_query') &&
    !capabilities.hasResolvedRescheduleTarget
  ) {
    return {
      allowed: false,
      reason: 'Reschedule inquiry must resolve_reschedule_target before consulting availability.',
    };
  }

  // Rescheduling consults the agenda only AFTER the preparatory cancellation;
  // `cancel_for_rescheduling` consumes the resolved target, so the cancelled
  // capture is the evidence here. The inquiry never cancels: it needs the
  // resolved target.
  if (
    activeFlow.intent === 'existing_appointment_rescheduling' &&
    (toolName === 'resolve_availability_query' || toolName === 'check_availability') &&
    !capabilities.hasCancelledRescheduleTarget
  ) {
    return {
      allowed: false,
      reason: `${toolName} requires cancel_for_rescheduling before consulting availability.`,
    };
  }
  if (
    activeFlow.intent === 'existing_appointment_reschedule_inquiry' &&
    (toolName === 'resolve_availability_query' || toolName === 'check_availability') &&
    !capabilities.hasResolvedRescheduleTarget
  ) {
    return {
      allowed: false,
      reason: `${toolName} requires resolve_reschedule_target before consulting availability.`,
    };
  }

  if (
    (activeFlow.intent === 'existing_appointment_rescheduling' ||
      activeFlow.intent === 'existing_appointment_reschedule_inquiry') &&
    toolName === 'check_availability' &&
    !capabilities.hasResolvedAvailabilityQuery
  ) {
    return {
      allowed: false,
      reason: 'check_availability requires resolve_availability_query with resolved dates first.',
    };
  }

  if (
    activeFlow.intent === 'existing_appointment_rescheduling' &&
    toolName === 'manage_schedule_block_status' &&
    toolArguments.action === 'cancel'
  ) {
    return {
      allowed: false,
      reason:
        'Rescheduling must use cancel_for_rescheduling, not manage_schedule_block_status(action=cancel).',
    };
  }

  // Full booking/rescheduling is backend-owned: schedule_block needs a current
  // availability result or a confirmed consultant selection.
  if (chatMode === 'full' && (
    activeFlow.intent === 'existing_appointment_rescheduling' ||
    activeFlow.intent === 'new_appointment_scheduling'
  )) {
    if (
      toolName === 'schedule_block' &&
      !capabilities.hasShownSlots
    ) {
      return {
        allowed: false,
        reason:
          'Full booking must have shown slots before schedule_block.',
      };
    }
    if (
      activeFlow.intent === 'existing_appointment_rescheduling' &&
      toolName === 'schedule_block' &&
      !capabilities.hasCancelledRescheduleTarget
    ) {
      return {
        allowed: false,
        reason: 'Full rescheduling must call cancel_for_rescheduling before schedule_block.',
      };
    }
  }

  // Derive the allowed set of tools for this flow
  const flowTools = new Set<string>();
  if (activeFlow.allowedTools && activeFlow.allowedTools.length > 0) {
    for (const tool of activeFlow.allowedTools) flowTools.add(tool);
  } else {
    for (const step of activeFlow.steps ?? []) {
      for (const tool of step.tools) flowTools.add(tool);
    }
  }



  // If the tool is not in the flow's allowed set, deny it
  if (!flowTools.has(toolName)) {
    const available = Array.from(flowTools).join(', ') || 'none';
    return {
      allowed: false,
      reason: `Tool '${toolName}' is not available in flow '${activeFlow.intent}'. Available: ${available}`,
    };
  }

  // Find all steps that include this tool
  const stepsWithTool = activeFlow.steps?.filter((step) => step.tools.includes(toolName)) ?? [];

  // If the tool is in the allowed set but no step declares it, allow unconditionally
  if (stepsWithTool.length === 0) {
    return { allowed: true };
  }

  // A tool is allowed if at least one of the steps that declare it has all its required capabilities satisfied.
  const anyStepAllowed = stepsWithTool.some((step) => {
    if (!step.required || step.required.length === 0) {
      return true;
    }
    return step.required.every((req) => capabilities[req as keyof typeof capabilities] === true);
  });

  if (anyStepAllowed) {
    return { allowed: true };
  }

  // Build a human-readable reason from the first blocked step
  const firstBlocked = stepsWithTool.find((step) => {
    if (!step.required || step.required.length === 0) return false;
    return step.required.some((req) => capabilities[req as keyof typeof capabilities] !== true);
  });
  const missing =
    firstBlocked?.required?.filter(
      (req) => capabilities[req as keyof typeof capabilities] !== true,
    ) ?? [];

  // Detect if the missing requirement looks like a tool name (common mistake)
  const toolNameMistakes = missing.filter((req) => ALL_TOOL_NAMES.includes(req));

  let reason: string;
  if (toolNameMistakes.length > 0) {
    reason =
      `Step requirements not met: ${missing.join(', ')}. ` +
      `WARNING: '${toolNameMistakes[0]}' is a tool name, not a capability flag. ` +
      `The 'required' field must contain capability flags (e.g., 'scheduling', 'protocols', 'reminders') or be empty []. ` +
      `Tool names in 'required' will ALWAYS block execution. Fix the JSON in the clinic's structuredLogic.`;
  } else {
    reason = `Step requirements not met: ${missing.join(', ')}`;
  }
  return { allowed: false, reason };
}
