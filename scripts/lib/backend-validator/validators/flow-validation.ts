/**
 * Flow Validation — validates flow steps, tools, and cross-references.
 *
 * Extracted from validator.ts (section 6) to separate flow-specific checks
 * from basic schema and structural validations.
 */

import { isReschedulingIntent } from '../canonical-intents';
import type {
  BusinessRule,
  StructuredLogic,
  StructuredLogicChatMode,
  ToolFlow,
} from '../structured-logic';
import { StructuredLogicJsonSchema } from '../structured-logic-json-schema';
import { extractAllowedKeys } from '../schema-key-extractor';
import { ALL_CHAT_TOOL_NAMES } from '../structured-logic-json-schema';
import {
  TURN_START_CAPABILITIES,
  TURN_START_CAPABILITY_SET,
  VALID_CAPABILITIES,
  CAPABILITY_ESTABLISHERS,
} from '../constants';
import { ALL_CHAT_TOOLS_TASKS_ONLY } from '../tool-definitions-tasks-only';

const ALLOWED_FLOW_KEYS = extractAllowedKeys(
  StructuredLogicJsonSchema,
  'properties.toolOrchestration.properties.flows.additionalProperties.properties',
);
const ALLOWED_SELECTION_KEYS = extractAllowedKeys(
  StructuredLogicJsonSchema,
  'properties.toolOrchestration.properties.flows.additionalProperties.properties.selection.properties',
);
const ALLOWED_STEP_KEYS = extractAllowedKeys(
  StructuredLogicJsonSchema,
  'properties.toolOrchestration.properties.flows.additionalProperties.properties.steps.items.properties',
);
const ALLOWED_INTENT_KEYS = extractAllowedKeys(
  StructuredLogicJsonSchema,
  'properties.intents.additionalProperties.properties',
);
const ALLOWED_RULE_KEYS = extractAllowedKeys(
  StructuredLogicJsonSchema,
  'properties.rules.items.properties',
);
const ALLOWED_CONDITION_KEYS = extractAllowedKeys(
  StructuredLogicJsonSchema,
  'properties.rules.items.properties.conditions.items.properties',
);

function rejectUnknownKeys(
  obj: Record<string, unknown> | null | undefined,
  allowedKeys: Set<string>,
  path: string,
  errors: string[],
): void {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (!allowedKeys.has(key)) {
      errors.push(`Unknown property at ${path}.${key}`);
    }
  }
}

export function validateFlowsAndTools(
  sl: Partial<StructuredLogic>,
  mode: StructuredLogicChatMode,
  errors: string[],
): void {
  const flows = sl.toolOrchestration?.flows ?? {};
  const validTools = new Set(ALL_CHAT_TOOL_NAMES);
  const tasksOnlyToolNames = new Set(ALL_CHAT_TOOLS_TASKS_ONLY.map((t) => t.name));
  const schedulingTools = new Set(
    ALL_CHAT_TOOL_NAMES.filter((name) => !tasksOnlyToolNames.has(name)),
  );

  // 6a. Flow steps must have unique, sequential step numbers
  Object.entries(flows).forEach(([flowName, flow]) => {
    if (!Array.isArray(flow.steps)) {
      errors.push(`Flow '${flowName}' steps must be an array`);
      return;
    }
    if (flow.steps.length === 0) {
      return;
    }
    const stepNumbers = flow.steps.map((step) => step.step);
    const uniqueStepNumbers = new Set(stepNumbers);
    if (uniqueStepNumbers.size !== stepNumbers.length) {
      errors.push(`Flow '${flowName}' has duplicate step numbers`);
    }
    const sorted = [...stepNumbers].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] !== i + 1) {
        errors.push(
          `Flow '${flowName}' steps must be sequential starting at 1 (got ${stepNumbers.join(', ')})`,
        );
        break;
      }
    }
  });

  // 6b. Validate rule field types
  (sl.rules ?? []).forEach((rule: BusinessRule, index: number) => {
    if (
      rule.requiredFields !== undefined &&
      rule.requiredFields !== null &&
      !Array.isArray(rule.requiredFields)
    ) {
      errors.push(
        `Rule ${index} (${rule.id || rule.intent}) requiredFields must be an array of strings`,
      );
    }
    if (
      rule.hidePrice !== undefined &&
      rule.hidePrice !== null &&
      typeof rule.hidePrice !== 'boolean'
    ) {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) hidePrice must be a boolean`);
    }
    if (
      rule.redirectToTask !== undefined &&
      rule.redirectToTask !== null &&
      typeof rule.redirectToTask !== 'boolean'
    ) {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) redirectToTask must be a boolean`);
    }
    if (
      rule.informOnly !== undefined &&
      rule.informOnly !== null &&
      typeof rule.informOnly !== 'boolean'
    ) {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) informOnly must be a boolean`);
    }
    if (rule.note !== undefined && rule.note !== null && typeof rule.note !== 'string') {
      errors.push(`Rule ${index} (${rule.id || rule.intent}) note must be a string`);
    }
  });

  // 6c. Validate intent examples are arrays of strings
  if (sl.intents && typeof sl.intents === 'object') {
    Object.entries(sl.intents).forEach(([intentId, intent]) => {
      rejectUnknownKeys(
        intent as Record<string, unknown>,
        ALLOWED_INTENT_KEYS,
        `intents.${intentId}`,
        errors,
      );
      if (
        intent.examples !== undefined &&
        intent.examples !== null &&
        !Array.isArray(intent.examples)
      ) {
        errors.push(`intents["${intentId}"].examples must be an array of strings`);
      } else if (Array.isArray(intent.examples)) {
        intent.examples.forEach((example, index) => {
          if (typeof example !== 'string') {
            errors.push(`intents["${intentId}"].examples[${index}] must be a string`);
          }
        });
      }
    });
  }

  // 6d. Tool names must match the bot mode profile
  Object.entries(flows).forEach(([flowName, flow]) => {
    rejectUnknownKeys(
      flow as unknown as Record<string, unknown>,
      ALLOWED_FLOW_KEYS,
      `flows.${flowName}`,
      errors,
    );
    if (
      flow.responseTemplateKey !== undefined &&
      flow.responseTemplateKey !== null &&
      typeof flow.responseTemplateKey !== 'string'
    ) {
      errors.push(`Flow '${flowName}' responseTemplateKey must be a string or null.`);
    }

    if (flow.selection !== undefined && flow.selection !== null) {
      if (typeof flow.selection !== 'object' || Array.isArray(flow.selection)) {
        errors.push(`Flow '${flowName}' selection must be an object`);
      } else {
        rejectUnknownKeys(
          flow.selection as unknown as Record<string, unknown>,
          ALLOWED_SELECTION_KEYS,
          `flows.${flowName}.selection`,
          errors,
        );
        const required = (flow.selection as { requiredCapabilities?: unknown })
          .requiredCapabilities;
        const alternatives = (flow.selection as { alternativeRequiredCapabilities?: unknown })
          .alternativeRequiredCapabilities;
        const excluded = (flow.selection as { excludedCapabilities?: unknown })
          .excludedCapabilities;
        const validateCapabilityList = (list: unknown, name: string) => {
          if (list === undefined || list === null) return;
          if (!Array.isArray(list)) {
            errors.push(`Flow '${flowName}' selection.${name} must be an array`);
            return;
          }
          list.forEach((cap, index) => {
            if (typeof cap !== 'string') {
              errors.push(`Flow '${flowName}' selection.${name}[${index}] must be a string`);
            } else if (!TURN_START_CAPABILITY_SET.has(cap)) {
              errors.push(
                `Flow '${flowName}' selection.${name} contains unsupported capability '${cap}'. Only turn-start capabilities are allowed: ${TURN_START_CAPABILITIES.join(', ')}`,
              );
            }
          });
        };
        validateCapabilityList(required, 'requiredCapabilities');
        validateCapabilityList(alternatives, 'alternativeRequiredCapabilities');
        validateCapabilityList(excluded, 'excludedCapabilities');
      }
    }

    if (Array.isArray(flow.allowedTools)) {
      flow.allowedTools.forEach((tool) => {
        if (!validTools.has(tool)) {
          errors.push(`Flow '${flowName}' allowedTools contains invalid tool '${tool}'.`);
        } else if (mode === 'tasks-only' && schedulingTools.has(tool)) {
          errors.push(
            `Flow '${flowName}' allowedTools contains scheduling tool '${tool}' but mode is 'tasks-only'.`,
          );
        }
      });
    }

    flow.steps.forEach((step, stepIndex) => {
      rejectUnknownKeys(
        step as unknown as Record<string, unknown>,
        ALLOWED_STEP_KEYS,
        `flows.${flowName}.steps[${stepIndex}]`,
        errors,
      );
      if ((step as any).condition !== undefined) {
        errors.push(
          `Flow '${flowName}' step ${stepIndex + 1} uses deprecated "condition" field. Move the condition text into the step "note" instead.`,
        );
      }
      step.tools.forEach((tool) => {
        if (!validTools.has(tool)) {
          errors.push(
            `Flow '${flowName}' step ${stepIndex + 1} references invalid tool '${tool}'.`,
          );
        } else if (mode === 'tasks-only' && schedulingTools.has(tool)) {
          errors.push(
            `Flow '${flowName}' step ${stepIndex + 1} uses scheduling tool '${tool}' but mode is 'tasks-only'. ` +
              `Scheduling tools are: ${Array.from(schedulingTools).join(', ')}. ` +
              `In tasks-only mode, use create_task for human follow-up instead.`,
          );
        }
      });
      if (Array.isArray(step.required)) {
        step.required.forEach((req) => {
          if (ALL_CHAT_TOOL_NAMES.includes(req)) {
            errors.push(
              `Flow '${flowName}' step ${stepIndex + 1} has invalid required capability '${req}'. Must be one of: ${Array.from(VALID_CAPABILITIES).join(', ')}. Tool names in 'required' will block execution at runtime.`,
            );
          } else if (!VALID_CAPABILITIES.has(req)) {
            errors.push(
              `Flow '${flowName}' step ${stepIndex + 1} has unknown required capability '${req}'. Must be one of: ${Array.from(VALID_CAPABILITIES).join(', ')}.`,
            );
          }
        });

        // Anti-circular requirement (technical invariant — always a bug, blocking).
        // A step may only REQUIRE capabilities established by EARLIER steps; if a tool
        // in the SAME step establishes the required capability, the tool can never run
        // at runtime (step_requirements_failed) and the flow deadlocks.
        for (const req of step.required) {
          const establishers = CAPABILITY_ESTABLISHERS[req] ?? [];
          const circularTools = step.tools.filter((tool) => establishers.includes(tool));
          if (circularTools.length > 0) {
            errors.push(
              `Flow '${flowName}' step ${stepIndex + 1} has a circular requirement: it requires '${req}', but ${circularTools
                .map((t) => `'${t}'`)
                .join(
                  ', ',
                )} — the tool that ESTABLISHES that capability — is in the same step, so it can never run at runtime (step_requirements_failed). ` +
                `FIX: 'required' must list what must be true BEFORE the step runs, established by EARLIER steps. Remove it from this step and declare it where the capability is CONSUMED ` +
                `(e.g., check_availability requires 'hasResolvedTreatment' from a previous resolve_treatment step; schedule_block requires 'hasResolvedPatient' from a previous resolve_patient step).`,
            );
          }
        }
      }
    });

    // 4.3 Validate that flows without tools have response mechanism
    const hasTools = flow.steps.some((step) => step.tools.length > 0);
    const hasAllowedTools = (flow.allowedTools || []).length > 0;
    const hasResponse = !!flow.responseTemplateKey || flow.allowsSilence === true;
    if (!hasTools && !hasAllowedTools && !hasResponse) {
      errors.push(
        `Flow '${flowName}' has no tools and no response mechanism (responseTemplateKey or allowsSilence). The bot will not know how to respond.`,
      );
    }
  });

  // 6d1. general_inquiry must have query_knowledge_base available in allowedTools or steps
  const generalInquiryFlow = flows['general_inquiry'];
  if (generalInquiryFlow) {
    const hasQkbInAllowed = (generalInquiryFlow.allowedTools || []).includes(
      'query_knowledge_base',
    );
    const hasQkbInSteps = generalInquiryFlow.steps.some((step) =>
      (step.tools || []).includes('query_knowledge_base'),
    );
    if (!hasQkbInAllowed && !hasQkbInSteps) {
      errors.push(
        `Flow "general_inquiry" must have "query_knowledge_base" available in allowedTools or steps. ` +
          `This is required in both full and tasks-only modes so the bot can search protocols, FAQ, responseTemplates and rules when the answer is not already in context.`,
      );
    }
  }

  // 6d2. Cross-reference validation: critical flows must use expected tools
  const flowUsesTool = (flow: ToolFlow, toolName: string): boolean => {
    const hasInAllowed = (flow.allowedTools || []).includes(toolName);
    const hasInSteps = flow.steps.some((step) => (step.tools || []).includes(toolName));
    return hasInAllowed || hasInSteps;
  };

  const findFlowByIntent = (intentName: string): { flowName: string; flow: ToolFlow } | null => {
    for (const [flowName, flow] of Object.entries(flows)) {
      if (flow.intent === intentName) {
        return { flowName, flow };
      }
    }
    return null;
  };

  // human_follow_up must use create_task
  const humanFlow = findFlowByIntent('human_follow_up');
  if (humanFlow && !flowUsesTool(humanFlow.flow, 'create_task')) {
    errors.push(
      `Flow "${humanFlow.flowName}" (intent: human_follow_up) must use "create_task" in allowedTools or steps. ` +
        `This is required to escalate to human staff.`,
    );
  }

  // NOTE: redirectToTask is NOT mandatory in any mode. The advisor decides whether
  // scheduling requests redirect to human tasks or are handled conversationally.
  // Previously enforced as blocking; now advisory only via detectModeAdvisoryGaps.

  // NOTE: create_task is NOT mandatory in tasks-only scheduling flows. The advisor
  // may design tasks-only flows with other approaches (e.g., informational responses).
  // Previously enforced as blocking; now advisory only via detectModeAdvisoryGaps.

  // 6d5. Full rescheduling that books a replacement must use the native
  // preparatory cancellation contract. Definitive status actions remain valid
  // in their own existing-appointment flows.
  if (mode === 'full') {
    // 6d5a. cancel_for_rescheduling is the preparatory cancellation of the
    // rescheduling contract — symmetric to the manage_schedule_block_status
    // ban below, it must never appear outside rescheduling-intent flows. A
    // definitive cancellation, confirmation or EN_ROUTE flow that includes it
    // would cancel WITHOUT the persisted target the rebooking path reuses.
    for (const [flowName, flow] of Object.entries(flows)) {
      if (isReschedulingIntent(flow.intent)) continue;
      if (!flowUsesTool(flow, 'cancel_for_rescheduling')) continue;
      errors.push(
        `Flow "${flowName}" (intent: ${flow.intent}) uses "cancel_for_rescheduling" outside a rescheduling flow. ` +
          `"cancel_for_rescheduling" is the preparatory cancellation of the rescheduling contract and is ONLY valid ` +
          `in flows whose intent is a rescheduling intent. For definitive cancellation, confirmation, or EN_ROUTE ` +
          `actions use "manage_schedule_block_status".`,
      );
    }

    const rescheduleFlows = Object.entries(flows).filter(([, flow]) =>
      isReschedulingIntent(flow.intent),
    );
    for (const [flowName, flow] of rescheduleFlows) {
      const targetIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('resolve_reschedule_target'),
      );
      if (
        flow.intent === 'existing_appointment_rescheduling' ||
        flow.intent === 'existing_appointment_reschedule_inquiry'
      ) {
        const patientIndex = flow.steps.findIndex((step) =>
          (step.tools || []).includes('resolve_patient'),
        );
        const targetStep = flow.steps.find((step) =>
          (step.tools || []).includes('resolve_reschedule_target'),
        );

        if (!(flow.allowedTools || []).includes('resolve_patient')) {
          errors.push(
            `Flow "${flowName}" (intent: ${flow.intent}) in full mode must include "resolve_patient" in allowedTools.`,
          );
        }
        if (patientIndex < 0 || targetIndex < 0 || patientIndex >= targetIndex) {
          errors.push(
            `Flow "${flowName}" (intent: ${flow.intent}) in full mode must declare "resolve_patient" before "resolve_reschedule_target".`,
          );
        }
        if (
          targetStep &&
          (!Array.isArray(targetStep.required) || !targetStep.required.includes('hasPatientTarget'))
        ) {
          errors.push(
            `Flow "${flowName}" (intent: ${flow.intent}) must require "hasPatientTarget" on the "resolve_reschedule_target" step.`,
          );
        }
      }

      const cancelIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('cancel_for_rescheduling'),
      );
      const usesSchedule = flowUsesTool(flow, 'schedule_block');
      const availabilityIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('check_availability'),
      );
      const resolveIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('resolve_availability_query'),
      );
      if (!usesSchedule) {
        if (availabilityIndex >= 0 &&
            (targetIndex < 0 || resolveIndex < 0 ||
              !(targetIndex < resolveIndex && resolveIndex < availabilityIndex))) {
          errors.push(
            `Flow "${flowName}" (intent: ${flow.intent}) must order patientTarget -> ` +
              `resolve_reschedule_target -> resolve_availability_query -> check_availability.`,
          );
        }
        continue;
      }

      if (flowUsesTool(flow, 'manage_schedule_block_status')) {
        errors.push(
          `Flow "${flowName}" (intent: ${flow.intent}) in full mode cannot use "manage_schedule_block_status" ` +
            `as the rescheduling cancellation route. Use "cancel_for_rescheduling" before availability resolution; ` +
            `"manage_schedule_block_status" is reserved for definitive cancellation, confirmation, or EN_ROUTE flows.`,
        );
      }

      if (cancelIndex < 0) {
        errors.push(
          `Flow "${flowName}" (intent: ${flow.intent}) in full mode must declare "cancel_for_rescheduling" ` +
            `when it includes "schedule_block".`,
        );
        continue;
      }
      if (targetIndex < 0 || targetIndex > cancelIndex) {
        errors.push(
          `Flow "${flowName}" (intent: ${flow.intent}) in full mode must resolve "resolve_reschedule_target" before "cancel_for_rescheduling".`,
        );
      }

      const scheduleIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('schedule_block'),
      );

      if (
        scheduleIndex < 0 ||
        availabilityIndex < 0 ||
        resolveIndex < 0 ||
        !(
          targetIndex < cancelIndex &&
          cancelIndex < resolveIndex &&
          resolveIndex < availabilityIndex &&
          availabilityIndex < scheduleIndex
        )
      ) {
        errors.push(
          `Flow "${flowName}" (intent: ${flow.intent}) declares "cancel_for_rescheduling" but must order ` +
            `patientTarget -> resolve_reschedule_target -> cancel_for_rescheduling -> resolve_availability_query -> ` +
            `check_availability -> schedule_block in numbered steps. The appointment is released preparatorily ` +
            `before the new date is asked or consulted, and booking reuses the persisted target.`,
        );
      }
    }
  }

  // 6d5b. Tasks-only permits cancellation-only, task-only, and informational
  // flows. If both tools are configured, their ordered steps must make the
  // successful cancellation happen before task creation.
  if (mode === 'tasks-only') {
    for (const [flowName, flow] of Object.entries(flows)) {
      const cancellationIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('manage_schedule_block_status'),
      );
      const taskIndex = flow.steps.findIndex((step) =>
        (step.tools || []).includes('create_task'),
      );
      const cancellationAllowed = (flow.allowedTools || []).includes(
        'manage_schedule_block_status',
      );
      const taskAllowed = (flow.allowedTools || []).includes('create_task');
      const usesCancellation = cancellationIndex >= 0 || cancellationAllowed;
      const usesTask = taskIndex >= 0 || taskAllowed;

      if (!usesCancellation || !usesTask) continue;

      if (cancellationIndex < 0 || taskIndex < 0 || cancellationIndex >= taskIndex) {
        errors.push(
          `Flow '${flowName}' in tasks-only mode combines 'manage_schedule_block_status' and 'create_task' ` +
            `but does not declare them in separate numbered steps with cancellation before task creation. ` +
            `Use manage_schedule_block_status in an earlier step, followed by create_task; either tool may be omitted entirely.`,
        );
      }
    }
  }

  // 6d6. new_appointment_scheduling flows must resolve the patient before scheduling
  const schedulingFlows = Object.entries(flows).filter(
    ([, flow]) => flow.intent === 'new_appointment_scheduling',
  );
  for (const [flowName, flow] of schedulingFlows) {
    // 6d6a. strict check: schedule_block in a step requires resolve_patient in an earlier step
    const scheduleBlockStepIndex = flow.steps.findIndex((step) =>
      (step.tools || []).includes('schedule_block'),
    );
    if (scheduleBlockStepIndex >= 0) {
      const hasResolvePatientBefore = flow.steps
        .slice(0, scheduleBlockStepIndex)
        .some((step) => (step.tools || []).includes('resolve_patient'));
      if (!hasResolvePatientBefore) {
        errors.push(
          `Flow '${flowName}' intent 'new_appointment_scheduling' uses schedule_block but does not have resolve_patient in an earlier step. Add resolve_patient before schedule_block to avoid booking with an unresolved patient.`,
        );
      }
    }

    // 6d6b. permissive check: schedule_block in allowedTools also requires resolve_patient somewhere in a prior step
    const hasScheduleBlockInAllowedTools = (flow.allowedTools || []).includes('schedule_block');
    if (hasScheduleBlockInAllowedTools && scheduleBlockStepIndex < 0) {
      const hasResolvePatientAnyStep = flow.steps.some((step) =>
        (step.tools || []).includes('resolve_patient'),
      );
      if (!hasResolvePatientAnyStep) {
        errors.push(
          `Flow '${flowName}' intent 'new_appointment_scheduling' allows schedule_block in allowedTools but does not have resolve_patient in any step. Add resolve_patient before the bot can use schedule_block to avoid booking with an unresolved patient.`,
        );
      }
    }
  }

  // 6e. BusinessRule protocolId must reference an existing protocol
  const protocolIds = new Set(Object.keys(sl.protocols ?? {}));
  (sl.rules ?? []).forEach((rule: BusinessRule, index: number) => {
    if (rule.protocolId && !protocolIds.has(rule.protocolId)) {
      errors.push(
        `Rule ${index} (${rule.id || rule.intent}) references protocolId '${rule.protocolId}' which does not exist in protocols`,
      );
    }
  });

  // 6f. Block rules must have a patient-facing message
  (sl.rules ?? []).forEach((rule: BusinessRule, index: number) => {
    if (rule.action === 'block') {
      if (!rule.message || rule.message.trim().length === 0) {
        errors.push(
          `Rule ${index} (${rule.id || rule.intent}) has action='block' and must include a 'message' for the patient. ` +
            `The 'message' field is what the bot tells the patient when blocking this request. ` +
            `Example: "I'm unable to process this request. Please contact the clinic directly."`,
        );
      }
    }
  });
}
