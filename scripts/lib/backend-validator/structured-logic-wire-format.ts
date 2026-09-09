/**
 * StructuredLogic Wire Format — Entry-array representation for OpenAI strict mode.
 *
 * OpenAI Structured Outputs with strict:true does NOT support maps with
 * dynamic keys (additionalProperties). The official workaround is to model
 * them as arrays of entry objects: [{ name, ... }] instead of { [name]: ... }.
 *
 * This module provides pure converters between the runtime map format
 * (StructuredLogic) and the wire entry-array format.
 *
 * Maps converted:
 * - intents        → [{ intentId, description, examples }]
 * - flows          → [{ flowName, intent, description, selection, steps, ... }]
 * - protocols      → [{ protocolId, name, description, responseTemplate, sections }]
 * - responseTemplates → [{ templateKey, text, mode }]
 *
 * Duplicates: last-wins (deterministic, matches Object.assign behavior).
 */

import type { StructuredLogic, IntentDefinition, ToolFlow, Protocol, ResponseTemplate, GlobalSchedulingPolicy } from './structured-logic';
import { StructuredLogicWireJsonSchema } from './structured-logic-wire-schema';
import { extractAllowedKeys } from './schema-key-extractor';

export type WireIntent = {
  intentId: string;
  description: string;
  examples?: string[] | null;
};

export type WireFlow = {
  flowName: string;
  intent: string;
  description: string;
  selection?: {
    requiredCapabilities?: string[] | null;
    alternativeRequiredCapabilities?: string[] | null;
    excludedCapabilities?: string[] | null;
  } | null;
  steps: Array<{
    step: number;
    tools: string[];
    parallel: boolean;
    required?: string[] | null;
    note?: string | null;
  }>;
  responseTemplateKey?: string | null;
  allowedTools?: string[] | null;
  allowsSilence?: boolean | null;
};

export type WireProtocol = {
  protocolId: string;
  name: string;
  description: string;
  responseTemplate: string;
  sections?: string[] | null;
};

export type WireResponseTemplate = {
  templateKey: string;
  text: string;
  mode?: 'literal' | 'model' | null;
};

export type WireToolOrchestration = {
  flows: WireFlow[];
};

export type WireStructuredLogic = {
  version: string;
  maxVisibleSlots: number | null;
  globalSchedulingPolicies: GlobalSchedulingPolicy[] | null;
  capabilities: { sensitiveSituations: boolean; protocols: boolean };
  intents: WireIntent[];
  toolOrchestration: WireToolOrchestration;
  rules: StructuredLogic['rules'];
  identity?: StructuredLogic['identity'];
  styleRules?: StructuredLogic['styleRules'];
  responseTemplates?: WireResponseTemplate[];
  faq?: StructuredLogic['faq'];
  serviceCatalog: { treatments: Array<{ name: string; description?: string | null; priceDescription?: string | null; requiresConsultation?: boolean | null; category?: string | null }>; packs?: Array<{ name: string; description?: string | null; priceDescription?: string | null; requiresConsultation?: boolean | null; category?: string | null }> | null };
  protocols?: WireProtocol[];
  errorCategories?: StructuredLogic['errorCategories'];
  treatmentPolicyHints?: StructuredLogic['treatmentPolicyHints'];
  treatmentSelectionGuidance: NonNullable<StructuredLogic['treatmentSelectionGuidance']> | null;
  systemPromptInstructions?: StructuredLogic['systemPromptInstructions'];
  conversationResumption?: StructuredLogic['conversationResumption'];
};

/**
 * Convert runtime StructuredLogic (maps) → wire entry-array format.
 */
export function toWireFormat(logic: StructuredLogic): WireStructuredLogic {
  return {
    version: logic.version,
    maxVisibleSlots: logic.maxVisibleSlots ?? null,
    globalSchedulingPolicies: logic.globalSchedulingPolicies ?? null,
    capabilities: logic.capabilities,
    intents: logic.intents
      ? Object.entries(logic.intents).map(([intentId, def]) => ({
          intentId,
          description: def.description,
          examples: def.examples,
        }))
      : [],
    toolOrchestration: {
      flows: logic.toolOrchestration?.flows
        ? Object.entries(logic.toolOrchestration.flows).map(([flowName, flow]) => ({
            flowName,
            intent: flow.intent,
            description: flow.description,
            selection: flow.selection
              ? {
                  requiredCapabilities: flow.selection.requiredCapabilities ?? null,
                  alternativeRequiredCapabilities: flow.selection.alternativeRequiredCapabilities ?? null,
                  excludedCapabilities: flow.selection.excludedCapabilities ?? null,
                }
              : null,
            steps: flow.steps,
            responseTemplateKey: flow.responseTemplateKey,
            allowedTools: flow.allowedTools,
            allowsSilence: flow.allowsSilence,
          }))
        : [],
    },
    rules: logic.rules,
    identity: logic.identity,
    styleRules: logic.styleRules,
    responseTemplates: logic.responseTemplates
      ? Object.entries(logic.responseTemplates).map(([templateKey, tmpl]) => ({
          templateKey,
          text: tmpl.text,
          mode: tmpl.mode,
        }))
      : [],
    faq: logic.faq,
    serviceCatalog: {
      treatments: logic.serviceCatalog?.treatments.map((t) => ({
        name: t.name,
        description: t.description ?? null,
        priceDescription: t.priceDescription ?? null,
        requiresConsultation: t.requiresConsultation ?? null,
        category: t.category ?? null,
      })) ?? [],
      packs: logic.serviceCatalog?.packs
        ? logic.serviceCatalog.packs.map((p) => ({
            name: p.name,
            description: p.description ?? null,
            priceDescription: p.priceDescription ?? null,
            requiresConsultation: p.requiresConsultation ?? null,
            category: p.category ?? null,
          }))
        : null,
    },
    protocols: logic.protocols
      ? Object.entries(logic.protocols).map(([protocolId, protocol]) => ({
          protocolId,
          name: protocol.name,
          description: protocol.description,
          responseTemplate: protocol.responseTemplate,
          sections: protocol.sections,
        }))
      : [],
    errorCategories: logic.errorCategories,
    treatmentPolicyHints: logic.treatmentPolicyHints,
    treatmentSelectionGuidance: logic.treatmentSelectionGuidance ?? null,
    systemPromptInstructions: logic.systemPromptInstructions,
    conversationResumption: logic.conversationResumption,
  };
}

/**
 * Convert wire entry-array format → runtime StructuredLogic (maps).
 * Duplicate keys: last-wins.
 */
export function fromWireFormat(wire: WireStructuredLogic): StructuredLogic {
  const intents: Record<string, IntentDefinition> = {};
  for (const entry of wire.intents) {
    const intent: IntentDefinition = { description: entry.description };
    if (entry.examples != null) intent.examples = entry.examples;
    intents[entry.intentId] = intent;
  }

  const flows: Record<string, ToolFlow> = {};
  for (const entry of wire.toolOrchestration.flows) {
    const flow: ToolFlow = {
      intent: entry.intent,
      description: entry.description,
      steps: entry.steps.map((s) => {
        const step: import('./structured-logic').ToolStep = {
          step: s.step,
          tools: s.tools,
          parallel: s.parallel,
        };
        if (s.required != null) step.required = s.required;
        if (s.note != null) step.note = s.note;
        return step;
      }),
    };
    if (entry.selection) {
      flow.selection = {};
      if (entry.selection.requiredCapabilities != null) {
        flow.selection.requiredCapabilities = entry.selection.requiredCapabilities;
      }
      if (entry.selection.alternativeRequiredCapabilities != null) {
        flow.selection.alternativeRequiredCapabilities = entry.selection.alternativeRequiredCapabilities;
      }
      if (entry.selection.excludedCapabilities != null) {
        flow.selection.excludedCapabilities = entry.selection.excludedCapabilities;
      }
    }
    if (entry.responseTemplateKey != null) flow.responseTemplateKey = entry.responseTemplateKey;
    if (entry.allowedTools != null) flow.allowedTools = entry.allowedTools;
    if (entry.allowsSilence != null) flow.allowsSilence = entry.allowsSilence;
    flows[entry.flowName] = flow;
  }

  const responseTemplates: Record<string, ResponseTemplate> = {};
  if (wire.responseTemplates) {
    for (const entry of wire.responseTemplates) {
      const tmpl: ResponseTemplate = { text: entry.text };
      if (entry.mode != null) tmpl.mode = entry.mode;
      responseTemplates[entry.templateKey] = tmpl;
    }
  }

  const protocols: Record<string, Protocol> = {};
  if (wire.protocols) {
    for (const entry of wire.protocols) {
      const protocol: Protocol = {
        name: entry.name,
        description: entry.description,
        responseTemplate: entry.responseTemplate,
      };
      if (entry.sections != null) protocol.sections = entry.sections;
      protocols[entry.protocolId] = protocol;
    }
  }

  const serviceCatalog: import('./structured-logic').ServiceCatalog = {
    treatments: wire.serviceCatalog.treatments.map((t) => {
      const treatment: import('./structured-logic').ChatService = { name: t.name };
      if (t.description != null) treatment.description = t.description;
      if (t.priceDescription != null) treatment.priceDescription = t.priceDescription;
      if (t.requiresConsultation != null) treatment.requiresConsultation = t.requiresConsultation;
      if (t.category != null) treatment.category = t.category;
      return treatment;
    }),
  };
  if (wire.serviceCatalog.packs != null) {
    serviceCatalog.packs = wire.serviceCatalog.packs.map((p) => {
      const pack: import('./structured-logic').ChatService = { name: p.name };
      if (p.description != null) pack.description = p.description;
      if (p.priceDescription != null) pack.priceDescription = p.priceDescription;
      if (p.requiresConsultation != null) pack.requiresConsultation = p.requiresConsultation;
      if (p.category != null) pack.category = p.category;
      return pack;
    });
  }

  const result: StructuredLogic = {
    version: wire.version,
    capabilities: wire.capabilities,
    intents,
    toolOrchestration: { flows },
    rules: wire.rules,
    serviceCatalog,
  };

  if (wire.maxVisibleSlots != null) result.maxVisibleSlots = wire.maxVisibleSlots;
  if (wire.globalSchedulingPolicies != null) {
    result.globalSchedulingPolicies = wire.globalSchedulingPolicies.map((policy) => ({
      // `canonicalizeNullValues` may turn this required semantic null into undefined.
      treatmentId: policy.treatmentId ?? null,
      allowedStartMinutes: policy.allowedStartMinutes,
    }));
  }

  if (wire.identity) result.identity = wire.identity;
  if (wire.styleRules) result.styleRules = wire.styleRules;
  if (wire.responseTemplates) result.responseTemplates = responseTemplates;
  if (wire.faq) result.faq = wire.faq;
  if (wire.protocols) result.protocols = protocols;
  if (wire.errorCategories) result.errorCategories = wire.errorCategories;
  if (wire.treatmentPolicyHints) result.treatmentPolicyHints = wire.treatmentPolicyHints;
  if (wire.treatmentSelectionGuidance !== undefined && wire.treatmentSelectionGuidance !== null) {
    result.treatmentSelectionGuidance = wire.treatmentSelectionGuidance;
  }
  if (wire.systemPromptInstructions) result.systemPromptInstructions = wire.systemPromptInstructions;
  if (wire.conversationResumption) result.conversationResumption = wire.conversationResumption;

  return result;
}

export type WireValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validate a wire-format StructuredLogic instance.
 * Checks structural requirements that the schema declares but that
 * `assertStrictModeCompliant` (schema definition validator) cannot verify
 * on actual data instances.
 */
export function validateWireStructuredLogic(wire: WireStructuredLogic): WireValidationResult {
  const errors: string[] = [];
  const allowedStepKeys = extractAllowedKeys(
    StructuredLogicWireJsonSchema,
    'properties.toolOrchestration.properties.flows.items.properties.steps.items.properties',
  );

  if (!wire.version || typeof wire.version !== 'string') {
    errors.push('version is required and must be a string');
  }

  if (!wire.capabilities || typeof wire.capabilities !== 'object') {
    errors.push('capabilities is required and must be an object');
  }

  if (!Array.isArray(wire.intents) || wire.intents.length === 0) {
    errors.push('intents must be an array with at least one entry');
  } else {
    wire.intents.forEach((intent, index) => {
      if (!intent.intentId || typeof intent.intentId !== 'string') {
        errors.push(`intents[${index}].intentId is required and must be a string`);
      }
      if (!intent.description || typeof intent.description !== 'string') {
        errors.push(`intents[${index}].description is required and must be a non-empty string`);
      }
    });
  }

  if (!Array.isArray(wire.rules) || wire.rules.length === 0) {
    errors.push('rules must be an array with at least one rule');
  }

  if (!wire.toolOrchestration || typeof wire.toolOrchestration !== 'object') {
    errors.push('toolOrchestration is required and must be an object');
  } else if (!Array.isArray(wire.toolOrchestration.flows) || wire.toolOrchestration.flows.length === 0) {
    errors.push('toolOrchestration.flows must be an array with at least one flow');
  } else {
    wire.toolOrchestration.flows.forEach((flow, index) => {
      if (!flow.flowName || typeof flow.flowName !== 'string') {
        errors.push(`toolOrchestration.flows[${index}].flowName is required and must be a string`);
      }
      if (!flow.intent || typeof flow.intent !== 'string') {
        errors.push(`toolOrchestration.flows[${index}].intent is required and must be a string`);
      }
      if (!Array.isArray(flow.steps)) {
        errors.push(`toolOrchestration.flows[${index}].steps must be an array`);
      } else if (flow.steps.length === 0 && !flow.responseTemplateKey && flow.allowsSilence !== true) {
        errors.push(
          `toolOrchestration.flows[${index}].steps is empty but has no responseTemplateKey or allowsSilence. ` +
            `Conversation-only flows must provide a responseTemplateKey.`
        );
      }
      if (Array.isArray(flow.steps)) {
        flow.steps.forEach((step, stepIndex) => {
          if (!step || typeof step !== 'object' || Array.isArray(step)) return;
          for (const key of Object.keys(step as unknown as Record<string, unknown>)) {
            if (!allowedStepKeys.has(key)) {
              errors.push(`toolOrchestration.flows[${index}].steps[${stepIndex}] has unknown property '${key}'`);
            }
          }
        });
      }
    });
  }

  if (!wire.serviceCatalog || typeof wire.serviceCatalog !== 'object') {
    errors.push('serviceCatalog is required and must be an object');
  } else if (!Array.isArray(wire.serviceCatalog.treatments) || wire.serviceCatalog.treatments.length === 0) {
    errors.push('serviceCatalog.treatments must be an array with at least one treatment');
  } else {
    wire.serviceCatalog.treatments.forEach((treatment, index) => {
      if (!treatment.name || typeof treatment.name !== 'string') {
        errors.push(`serviceCatalog.treatments[${index}].name is required and must be a string`);
      }
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
