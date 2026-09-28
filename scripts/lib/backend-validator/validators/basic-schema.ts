/**
 * Basic Schema Validator — validates core structure of structuredLogic.
 *
 * Extracted from validator.ts (section 1) to separate basic schema checks
 * from domain-specific and cross-reference validations.
 */

import type { StructuredLogic, ToolFlow } from '../structured-logic';
import { StructuredLogicJsonSchema } from '../structured-logic-json-schema';
import { extractAllowedKeys } from '../schema-key-extractor';

const ALLOWED_TOOL_ORCHESTRATION_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.toolOrchestration.properties');
const ALLOWED_SERVICE_CATALOG_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.serviceCatalog.properties');
const ALLOWED_CHAT_SERVICE_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.serviceCatalog.properties.treatments.items.properties');
const ALLOWED_SCHEDULING_POLICY_KEYS = extractAllowedKeys(StructuredLogicJsonSchema, 'properties.globalSchedulingPolicies.items.properties');

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

export function validateBasicSchema(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 1. Basic schema validation
  if (!sl.version) errors.push('version is required. Use "1.0" for the current schema version.');
  if (
    sl.maxVisibleSlots !== undefined &&
    (!Number.isInteger(sl.maxVisibleSlots) || sl.maxVisibleSlots < 1 || sl.maxVisibleSlots > 50)
  ) {
    errors.push('maxVisibleSlots must be an integer between 1 and 50');
  }
  if (sl.globalSchedulingPolicies !== undefined) {
    if (!Array.isArray(sl.globalSchedulingPolicies)) {
      errors.push('globalSchedulingPolicies must be an array');
    } else {
      const seenPolicyTreatmentIds = new Set<string | null>();
      sl.globalSchedulingPolicies.forEach((policy, index) => {
        if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
          errors.push(`globalSchedulingPolicies[${index}] must be an object`);
          return;
        }
        rejectUnknownKeys(
          policy as unknown as Record<string, unknown>,
          ALLOWED_SCHEDULING_POLICY_KEYS,
          `globalSchedulingPolicies[${index}]`,
          errors,
        );
        if (policy.treatmentId !== null && typeof policy.treatmentId !== 'string') {
          errors.push(`globalSchedulingPolicies[${index}].treatmentId must be a string or null`);
        } else if (seenPolicyTreatmentIds.has(policy.treatmentId)) {
          errors.push(
            `globalSchedulingPolicies[${index}].treatmentId is duplicated: each treatmentId may appear only once ` +
              `(null identifies the single clinic-wide policy)`,
          );
        } else {
          seenPolicyTreatmentIds.add(policy.treatmentId);
        }
        const hasMinutes =
          policy.allowedStartMinutes !== undefined && policy.allowedStartMinutes !== null;
        const hasStrategy =
          policy.slotMinuteStrategy !== undefined && policy.slotMinuteStrategy !== null;
        if (hasMinutes && hasStrategy) {
          errors.push(
            `globalSchedulingPolicies[${index}] cannot define both allowedStartMinutes and slotMinuteStrategy`,
          );
        }
        if (policy.treatmentId === null && !hasMinutes && !hasStrategy) {
          errors.push(
            `globalSchedulingPolicies[${index}] must define exactly one of allowedStartMinutes or slotMinuteStrategy`,
          );
        }
        if (
          hasStrategy &&
          policy.slotMinuteStrategy !== 'fixed' &&
          policy.slotMinuteStrategy !== 'anchored'
        ) {
          errors.push(
            `globalSchedulingPolicies[${index}].slotMinuteStrategy must be fixed or anchored`,
          );
        }
        const minutes = policy.allowedStartMinutes;
        if (hasMinutes && (!Array.isArray(minutes) || minutes.length === 0)) {
          errors.push(`globalSchedulingPolicies[${index}].allowedStartMinutes must be a non-empty array`);
        } else if (Array.isArray(minutes)) {
          const seen = new Set<number>();
          for (const minute of minutes) {
            if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
              errors.push(`globalSchedulingPolicies[${index}].allowedStartMinutes must contain unique integers between 0 and 59`);
              break;
            }
            if (seen.has(minute)) {
              errors.push(`globalSchedulingPolicies[${index}].allowedStartMinutes must contain unique integers between 0 and 59`);
              break;
            }
            seen.add(minute);
          }
        }
      });
    }
  }
  if (!sl.capabilities || typeof sl.capabilities !== 'object') {
    errors.push(
      'capabilities is required and must be an object. ' +
        'Required fields: sensitiveSituations (boolean), protocols (boolean). ' +
        'Example: { sensitiveSituations: false, protocols: false }'
    );
  }
  if (!sl.intents || typeof sl.intents !== 'object') {
    errors.push('intents catalog is required and must be an object');
  } else if (Object.keys(sl.intents).length === 0) {
    errors.push('intents catalog is empty. The classifier needs a non-empty menu of available intents.');
  }
  if (!sl.toolOrchestration || typeof sl.toolOrchestration !== 'object') {
    errors.push('toolOrchestration is required and must be an object');
  } else {
    rejectUnknownKeys(
      sl.toolOrchestration as Record<string, unknown>,
      ALLOWED_TOOL_ORCHESTRATION_KEYS,
      'toolOrchestration',
      errors,
    );
  }
  if (!Array.isArray(sl.rules)) {
    errors.push('rules is required and must be an array');
  } else if (sl.rules.length === 0) {
    errors.push('rules must contain at least one rule for intent classification. Empty rules array breaks flow scoping and allows all tools.');
  }

  // Reject unknown top-level properties (strict schema)
  const allowedTopLevelKeys = new Set([
    'version',
    'maxVisibleSlots',
    'availabilityPresentation',
    'globalSchedulingPolicies',
    'capabilities',
    'identity',
    'styleRules',
    'responseTemplates',
    'faq',
    'intents',
    'toolOrchestration',
    'rules',
    'protocols',
    'errorCategories',
    'treatmentPolicyHints',
    'treatmentSelectionGuidance',
    'systemPromptInstructions',
    'conversationResumption',
    'serviceCatalog',
    'treatmentRouting',
    'unmatchedTreatmentPolicy',
  ]);
  const unknownKeys = Object.keys(sl).filter((k) => !allowedTopLevelKeys.has(k));
  if (unknownKeys.length > 0) {
    errors.push(`Unknown top-level properties are not allowed: ${unknownKeys.join(', ')}`);
  }

  // Validate intent references exist in catalog
  const declaredIntents = new Set(sl.intents ? Object.keys(sl.intents) : []);

  if (sl.toolOrchestration?.flows && typeof sl.toolOrchestration.flows === 'object') {
    for (const [flowName, flow] of Object.entries(sl.toolOrchestration.flows as Record<string, ToolFlow>)) {
      if (!flow.intent) {
        errors.push(`Flow "${flowName}" is missing required field "intent". Every flow must reference an intent from the intents catalog.`);
      } else if (!declaredIntents.has(flow.intent)) {
        errors.push(
          `Flow "${flowName}" references intent "${flow.intent}" which is not declared in the intents catalog. ` +
            `Add it to "intents" first: { "${flow.intent}": { "description": "What this intent means", "examples": ["example phrase"] } }`
        );
      }
    }
  }

  if (Array.isArray(sl.rules)) {
    for (const rule of sl.rules) {
      if (!rule.intent) {
        errors.push(`Rule "${rule.id || '(unknown)'}" is missing required field "intent". Every rule must reference an intent from the intents catalog.`);
      } else if (!declaredIntents.has(rule.intent)) {
        errors.push(
          `Rule "${rule.id || '(unknown)'}" references intent "${rule.intent}" which is not declared in the intents catalog. ` +
            `Add it to "intents" first: { "${rule.intent}": { "description": "What this intent means", "examples": ["example phrase"] } }`
        );
      }
    }
  }
}

export function validateServiceCatalog(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 1b. serviceCatalog validation
  if (!sl.serviceCatalog || typeof sl.serviceCatalog !== 'object') {
    errors.push(
      'serviceCatalog is required. It replaces the old TREATMENTS_LIST placeholder. ' +
        'Define at least one treatment with: name (required), priceDescription (optional: exact price like "50 EUR", ' +
        'a range like "From 120 EUR", or an AI directive like "Consult clinic" / "Custom price after evaluation"), ' +
        'and requiresConsultation (optional: true/false — tells the AI if a prior consultation is needed before booking). ' +
        'Example: { name: "First visit", priceDescription: "Consult clinic", requiresConsultation: true }',
    );
  } else {
    rejectUnknownKeys(sl.serviceCatalog as Record<string, unknown>, ALLOWED_SERVICE_CATALOG_KEYS, 'serviceCatalog', errors);
    if (!Array.isArray(sl.serviceCatalog.treatments) || sl.serviceCatalog.treatments.length === 0) {
      errors.push(
        'serviceCatalog.treatments must have at least one treatment. ' +
          'Each treatment needs: name (required), priceDescription (optional: put a price OR a directive), ' +
          'requiresConsultation (optional: true/false). ' +
          'Tip: priceDescription accepts exact prices ("50 EUR"), ranges ("From 120 EUR"), or AI directives ' +
          '("Consult clinic", "Custom price after evaluation"). The AI will repeat this text verbatim when asked.',
      );
    } else {
      sl.serviceCatalog.treatments.forEach((treatment, index) => {
        rejectUnknownKeys(treatment as unknown as Record<string, unknown>, ALLOWED_CHAT_SERVICE_KEYS, `serviceCatalog.treatments[${index}]`, errors);
        if (!treatment.name || typeof treatment.name !== 'string' || treatment.name.trim().length === 0) {
          errors.push(`serviceCatalog.treatments[${index}].name is required and must be a non-empty string`);
        }
        if (treatment.priceDescription !== undefined && treatment.priceDescription !== null && (typeof treatment.priceDescription !== 'string' || treatment.priceDescription.trim().length === 0)) {
          errors.push(
            `serviceCatalog.treatments[${index}].priceDescription must be a non-empty string. ` +
              `Tip: You can write an exact price (e.g. "50 EUR"), a range (e.g. "From 120 EUR"), ` +
              `or an AI directive (e.g. "Consult clinic", "Custom price after evaluation", "Price depends on complexity"). ` +
              `The AI will use this text verbatim when the patient asks about pricing. ` +
              `Use requiresConsultation: true if this treatment needs a prior consultation before booking.`,
          );
        }
        if (treatment.requiresConsultation !== undefined && treatment.requiresConsultation !== null && typeof treatment.requiresConsultation !== 'boolean') {
          errors.push(`serviceCatalog.treatments[${index}].requiresConsultation must be a boolean`);
        }
      });
    }
    if (sl.serviceCatalog.packs !== undefined && sl.serviceCatalog.packs !== null) {
      if (!Array.isArray(sl.serviceCatalog.packs)) {
        errors.push('serviceCatalog.packs must be an array');
      } else {
        sl.serviceCatalog.packs.forEach((pack, index) => {
          rejectUnknownKeys(pack as unknown as Record<string, unknown>, ALLOWED_CHAT_SERVICE_KEYS, `serviceCatalog.packs[${index}]`, errors);
          if (!pack.name || typeof pack.name !== 'string' || pack.name.trim().length === 0) {
            errors.push(`serviceCatalog.packs[${index}].name is required and must be a non-empty string`);
          }
        });
      }
    }
  }
}

export function validateLegacyIntents(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 1c. Prohibit legacy intent price_inquiry
  const declaredIntents = new Set(sl.intents ? Object.keys(sl.intents) : []);
  if (declaredIntents.has('price_inquiry')) {
    errors.push(
      'Intent "price_inquiry" is prohibited. Use "general_inquiry" instead and configure ' +
        'serviceCatalog.treatments[].priceDescription for each treatment. ' +
        'Tip: priceDescription is flexible — it can be an exact price ("50 EUR"), a range ("From 120 EUR"), ' +
        'or an AI directive ("Consult clinic", "Price after evaluation"). ' +
        'The AI will say exactly what you write. Use requiresConsultation: true if a prior consultation is required.',
    );
  }
}

export function validateRequiredTemplates(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 1d. Required response templates
  const requiredTemplates = ['information_not_available', 'out_of_scope', 'farewell'];
  const availableTemplates = new Set(Object.keys(sl.responseTemplates ?? {}));
  for (const templateKey of requiredTemplates) {
    if (!availableTemplates.has(templateKey)) {
      errors.push(
        `responseTemplates must include template "${templateKey}". ` +
          `Add: { "${templateKey}": { "text": "Your text here", "mode": "literal" } }`
      );
    }
  }
}

export function validateFarewellFlow(
  sl: Partial<StructuredLogic>,
  errors: string[],
): void {
  // 1e. farewell flow with allowsSilence validation
  let hasFarewellFlow = false;
  const flows = sl.toolOrchestration?.flows ?? {};
  Object.entries(flows).forEach(([flowName, flow]) => {
    if (flow.intent === 'farewell') {
      hasFarewellFlow = true;
      if (flow.allowsSilence !== true) {
        errors.push(`Flow "${flowName}" (intent: farewell) must have allowsSilence: true`);
      }
    } else if (flow.allowsSilence === true) {
      errors.push(`Flow "${flowName}" has allowsSilence: true. Only the farewell flow may have this flag.`);
    }
  });
  if (!hasFarewellFlow) {
    errors.push('toolOrchestration.flows must include a flow with intent "farewell" and allowsSilence: true');
  }
}
