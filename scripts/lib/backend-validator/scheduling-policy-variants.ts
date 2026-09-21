type SchedulingPolicyProperties = {
  treatmentId: { type: 'null' | 'string' };
  allowedStartMinutes:
    | { type: 'null' }
    | {
        type: 'array';
        minItems: 1;
        uniqueItems: true;
        items: { type: 'integer'; minimum: 0; maximum: 59 };
      };
  slotMinuteStrategy: { type: 'null' } | { type: 'string'; enum: readonly ['fixed', 'anchored'] };
};

const POLICY_REQUIRED_FIELDS = [
  'treatmentId',
  'allowedStartMinutes',
  'slotMinuteStrategy',
] as const;

/**
 * Shared strict variants for global and treatment-specific scheduling policies.
 * Null is represented by `type`, never by an enum member.
 */
export function buildSchedulingPolicyVariants() {
  const policy = (properties: SchedulingPolicyProperties) => ({
    type: 'object' as const,
    properties,
    required: POLICY_REQUIRED_FIELDS,
    additionalProperties: false as const,
  });

  return [
    policy({
      treatmentId: { type: 'null' },
      allowedStartMinutes: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: { type: 'integer', minimum: 0, maximum: 59 },
      },
      slotMinuteStrategy: { type: 'null' },
    }),
    policy({
      treatmentId: { type: 'null' },
      allowedStartMinutes: { type: 'null' },
      slotMinuteStrategy: { type: 'string', enum: ['fixed', 'anchored'] },
    }),
    policy({
      treatmentId: { type: 'string' },
      allowedStartMinutes: { type: 'null' },
      slotMinuteStrategy: { type: 'null' },
    }),
    policy({
      treatmentId: { type: 'string' },
      allowedStartMinutes: {
        type: 'array',
        minItems: 1,
        uniqueItems: true,
        items: { type: 'integer', minimum: 0, maximum: 59 },
      },
      slotMinuteStrategy: { type: 'null' },
    }),
    policy({
      treatmentId: { type: 'string' },
      allowedStartMinutes: { type: 'null' },
      slotMinuteStrategy: { type: 'string', enum: ['fixed', 'anchored'] },
    }),
  ] as const;
}

export const SCHEDULING_POLICY_VARIANTS = buildSchedulingPolicyVariants();
