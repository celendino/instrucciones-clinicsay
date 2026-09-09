/**
 * Canonical registry of all chat tool names.
 *
 * This is the SINGLE source of truth for tool names across the instructions repo.
 * Any script that needs to validate, reference, or check tool names MUST import from here.
 *
 * When adding a new tool to the backend:
 * 1. Add it to the backend's tool-definitions-*.ts files FIRST
 * 2. Then add the name here so validators and scripts recognize it
 */

/** All tool names available in FULL mode */
const FULL_MODE_TOOLS = [
  'resolve_patient',
  'resolve_treatment',
  'resolve_professional',
  'resolve_availability_query',
  'resolve_reschedule_target',
  'check_availability',
  'schedule_block',
  'cancel_for_rescheduling',
  'manage_schedule_block_status',
  'manage_all_schedule_blocks_for_date',
  'create_task',
  'lookup_patient',
  'query_protocol',
  'query_knowledge_base',
];

/** All tool names available in TASKS-ONLY mode */
const TASKS_ONLY_TOOLS = [
  'resolve_patient',
  'manage_schedule_block_status',
  'manage_all_schedule_blocks_for_date',
  'create_task',
  'lookup_patient',
  'query_protocol',
  'query_knowledge_base',
];

/** Union of all tool names (used for validation regardless of mode) */
const ALL_TOOLS = [...new Set([...FULL_MODE_TOOLS, ...TASKS_ONLY_TOOLS])];

module.exports = {
  FULL_MODE_TOOLS,
  TASKS_ONLY_TOOLS,
  ALL_TOOLS,
};
