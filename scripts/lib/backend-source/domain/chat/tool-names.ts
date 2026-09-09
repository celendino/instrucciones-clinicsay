/**
 * Canonical list of all chat tool names.
 *
 * This array is derived from the tool definition exports in
 * tool-definitions-full.ts and tool-definitions-tasks-only.ts.
 *
 * Use this for validation, error messages, or any check that needs
 * to know if a string is a known tool name.
 *
 * NOTE: Keep in sync with clinicsay-instructions/scripts/lib/tool-registry.js
 */

import {
  TOOL_CHECK_AVAILABILITY,
  TOOL_RESOLVE_AVAILABILITY_QUERY,
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
} from './tool-definitions-full';

export const ALL_TOOL_NAMES = [
  TOOL_CHECK_AVAILABILITY.name,
  TOOL_RESOLVE_AVAILABILITY_QUERY.name,
  TOOL_SCHEDULE_BLOCK.name,
  TOOL_CANCEL_FOR_RESCHEDULING.name,
  TOOL_MANAGE_SCHEDULE_BLOCK_STATUS.name,
  TOOL_MANAGE_ALL_SCHEDULE_BLOCKS_FOR_DATE.name,
  TOOL_CREATE_TASK.name,
  TOOL_RESOLVE_PATIENT.name,
  TOOL_RESOLVE_RESCHEDULE_TARGET.name,
  TOOL_RESOLVE_PROFESSIONAL.name,
  TOOL_RESOLVE_TREATMENT.name,
  TOOL_LOOKUP_PATIENT.name,
  TOOL_QUERY_PROTOCOL.name,
  TOOL_QUERY_KNOWLEDGE_BASE.name,
];
