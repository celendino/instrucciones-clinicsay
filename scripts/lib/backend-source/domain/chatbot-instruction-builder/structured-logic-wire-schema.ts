/**
 * JSON Schema for StructuredLogic — WIRE ENTRY-ARRAY FORMAT.
 *
 * This schema replaces all dynamic-key maps with entry arrays so OpenAI
 * strict:true can be enabled. Maps become arrays of objects with explicit
 * key fields:
 * - intents        → [{ intentId, description, examples }]
 * - flows          → [{ flowName, intent, description, selection, steps, ... }]
 * - protocols      → [{ protocolId, name, description, responseTemplate, sections }]
 * - responseTemplates → [{ templateKey, text, mode }]
 *
 * PURPOSE:
 * - OpenAI structured output schema for Reduce (combineKeyPoints) and BUILD
 *   (chatWithTools / chatWithStructuredOutput) with strict:true.
 * - `get_schema` deterministic tool returns this schema so the LLM knows the
 *   exact shape it must produce.
 *
 * Runtime conversion: `toWireFormat()` / `fromWireFormat()` in
 * `structured-logic-wire-format.ts`.
 *
 * @see StructuredLogicJsonSchema — runtime map format (additionalProperties).
 */

import { ALL_CHAT_TOOL_NAMES } from './structured-logic-json-schema';

export const StructuredLogicWireJsonSchema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    maxVisibleSlots: { type: ['integer', 'null'], minimum: 1, maximum: 50 },
    globalSchedulingPolicies: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: {
          treatmentId: { type: ['string', 'null'] },
          allowedStartMinutes: {
            type: 'array',
            minItems: 1,
            uniqueItems: true,
            items: { type: 'integer', minimum: 0, maximum: 59 },
          },
        },
        required: ['treatmentId', 'allowedStartMinutes'],
        additionalProperties: false,
      },
    },
    capabilities: {
      type: 'object',
      properties: {
        sensitiveSituations: { type: 'boolean' },
        protocols: { type: 'boolean' },
      },
      required: ['sensitiveSituations', 'protocols'],
      additionalProperties: false,
    },
    intents: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          intentId: { type: 'string' },
          description: { type: 'string' },
          examples: { type: ['array', 'null'], items: { type: 'string' } },
        },
        required: ['intentId', 'description', 'examples'],
        additionalProperties: false,
      },
    },
    toolOrchestration: {
      type: 'object',
      properties: {
        flows: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              flowName: { type: 'string' },
              intent: { type: 'string' },
              description: { type: 'string' },
              selection: {
                type: ['object', 'null'],
                properties: {
                  requiredCapabilities: { type: ['array', 'null'], items: { type: 'string' } },
                  alternativeRequiredCapabilities: { type: ['array', 'null'], items: { type: 'string' } },
                  excludedCapabilities: { type: ['array', 'null'], items: { type: 'string' } },
                },
                required: ['requiredCapabilities', 'alternativeRequiredCapabilities', 'excludedCapabilities'],
                additionalProperties: false,
              },
              steps: {
                type: 'array',
                minItems: 1,
                items: {
                  type: 'object',
                  properties: {
                    step: { type: 'number' },
                    tools: { type: 'array', items: { type: 'string', enum: ALL_CHAT_TOOL_NAMES } },
                    parallel: { type: 'boolean' },
                    required: { type: ['array', 'null'], items: { type: 'string' } },
                    note: { type: ['string', 'null'] },
                  },
                  required: ['step', 'tools', 'parallel', 'required', 'note'],
                  additionalProperties: false,
                },
              },
              responseTemplateKey: { type: ['string', 'null'], description: 'Optional key into the responseTemplates registry.' },
              allowedTools: { type: ['array', 'null'], items: { type: 'string', enum: ALL_CHAT_TOOL_NAMES } },
              allowsSilence: { type: ['boolean', 'null'] },
            },
            required: ['flowName', 'intent', 'description', 'selection', 'steps', 'responseTemplateKey', 'allowedTools', 'allowsSilence'],
            additionalProperties: false,
          },
        },
      },
      required: ['flows'],
      additionalProperties: false,
    },
    rules: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          id: { type: ['string', 'null'] },
          intent: { type: 'string' },
          description: { type: ['string', 'null'] },
          action: { type: 'string', enum: ['allow', 'block'] },
          conditionLogic: { type: ['string', 'null'], enum: ['and', 'or'] },
          conditions: {
            type: ['array', 'null'],
            items: {
              type: 'object',
              properties: {
                field: { type: 'string' },
                operator: { type: 'string', enum: ['equals', 'in', 'not_in', 'gt', 'lt', 'gte', 'lte', 'contains', 'exists'] },
                value: {
                  anyOf: [
                    { type: 'string' },
                    { type: 'number' },
                    { type: 'boolean' },
                    { type: 'array', items: { type: 'string' } },
                    { type: 'null' },
                  ],
                },
                negated: { type: ['boolean', 'null'] },
                note: { type: ['string', 'null'] },
              },
              required: ['field', 'operator', 'value', 'negated', 'note'],
              additionalProperties: false,
            },
          },
          reason: { type: ['string', 'null'] },
          message: { type: ['string', 'null'] },
          protocolId: { type: ['string', 'null'] },
          requiredFields: { type: ['array', 'null'], items: { type: 'string' } },
          note: { type: ['string', 'null'] },
          priority: { type: ['number', 'null'] },
          hidePrice: { type: ['boolean', 'null'] },
          redirectToTask: { type: ['boolean', 'null'] },
          informOnly: { type: ['boolean', 'null'] },
        },
        required: ['id', 'intent', 'description', 'action', 'conditionLogic', 'conditions', 'reason', 'message', 'protocolId', 'requiredFields', 'note', 'priority', 'hidePrice', 'redirectToTask', 'informOnly'],
        additionalProperties: false,
      },
    },
    identity: {
      type: 'object',
      properties: {
        botName: { type: ['string', 'null'] },
        clinicName: { type: ['string', 'null'] },
        address: { type: ['string', 'null'] },
        phone: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
        website: { type: ['string', 'null'] },
        openingHours: { type: ['string', 'null'] },
        language: { type: ['string', 'null'] },
        persona: { type: ['string', 'null'] },
        tone: { type: ['string', 'null'] },
        farewellMessage: { type: ['string', 'null'] },
        escalationMessage: { type: ['string', 'null'] },
        socialLinks: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string' },
              url: { type: 'string' },
            },
            required: ['platform', 'url'],
            additionalProperties: false,
          },
        },
        additionalContacts: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              value: { type: 'string' },
              label: { type: ['string', 'null'] },
            },
            required: ['type', 'value', 'label'],
            additionalProperties: false,
          },
        },
      },
      required: ['botName', 'clinicName', 'address', 'phone', 'email', 'website', 'openingHours', 'language', 'persona', 'tone', 'farewellMessage', 'escalationMessage', 'socialLinks', 'additionalContacts'],
      additionalProperties: false,
    },
    styleRules: {
      type: 'object',
      properties: {
        brevity: { type: ['string', 'null'] },
        format: { type: ['string', 'null'] },
        tone: { type: ['string', 'null'] },
        emojiPolicy: { type: ['string', 'null'], enum: ['allowed', 'forbidden', 'contextual'] },
        languagePolicy: { type: ['string', 'null'] },
        noMedicalDiagnosis: { type: ['boolean', 'null'] },
        noAsterisks: { type: ['boolean', 'null'] },
        noMarkdown: { type: ['boolean', 'null'] },
        maxSentences: { type: ['number', 'null'] },
        maxWordsPerSentence: { type: ['number', 'null'] },
        avoidPhrases: { type: ['array', 'null'], items: { type: 'string' } },
        mandatoryPhrases: { type: ['array', 'null'], items: { type: 'string' } },
        additionalRules: { type: ['array', 'null'], items: { type: 'string' } },
        mustOfferHumanHandoff: { type: ['boolean', 'null'] },
        timeGreetingRanges: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', enum: ['dias', 'tardes', 'noches'] },
              start: { type: 'string' },
              end: { type: 'string' },
              greeting: { type: 'string' },
            },
            required: ['label', 'start', 'end', 'greeting'],
            additionalProperties: false,
          },
        },
      },
      required: ['brevity', 'format', 'tone', 'emojiPolicy', 'languagePolicy', 'noMedicalDiagnosis', 'noAsterisks', 'noMarkdown', 'maxSentences', 'maxWordsPerSentence', 'avoidPhrases', 'mandatoryPhrases', 'additionalRules', 'mustOfferHumanHandoff', 'timeGreetingRanges'],
      additionalProperties: false,
    },
    responseTemplates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          templateKey: { type: 'string' },
          text: { type: 'string' },
          mode: { type: ['string', 'null'], enum: ['literal', 'model'] },
        },
        required: ['templateKey', 'text', 'mode'],
        additionalProperties: false,
      },
    },
    faq: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string' },
          answer: { type: 'string' },
          condition: { type: ['string', 'null'] },
        },
        required: ['question', 'answer', 'condition'],
        additionalProperties: false,
      },
    },
    serviceCatalog: {
      type: 'object',
      properties: {
        treatments: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              priceDescription: { type: ['string', 'null'] },
              requiresConsultation: { type: ['boolean', 'null'] },
              category: { type: ['string', 'null'] },
            },
            required: ['name', 'description', 'priceDescription', 'requiresConsultation', 'category'],
            additionalProperties: false,
          },
        },
        packs: {
          type: ['array', 'null'],
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              priceDescription: { type: ['string', 'null'] },
              requiresConsultation: { type: ['boolean', 'null'] },
              category: { type: ['string', 'null'] },
            },
            required: ['name', 'description', 'priceDescription', 'requiresConsultation', 'category'],
            additionalProperties: false,
          },
        },
      },
      required: ['treatments', 'packs'],
      additionalProperties: false,
    },
    protocols: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          protocolId: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          responseTemplate: { type: ['string', 'null'] },
          sections: { type: ['array', 'null'], items: { type: 'string' } },
        },
        required: ['protocolId', 'name', 'description', 'responseTemplate', 'sections'],
        additionalProperties: false,
      },
    },
    errorCategories: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          description: { type: 'string' },
          keywords: { type: ['array', 'null'], items: { type: 'string' } },
          suggestions: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'description', 'keywords', 'suggestions'],
        additionalProperties: false,
      },
    },
    treatmentSelectionGuidance: {
      type: ['string', 'null'],
      description:
        'Prosa libre con las indicaciones de la clínica para IDENTIFICAR el tratamiento correcto ' +
        'que corresponde a lo que pide el paciente. Se inyecta en el prompt del orquestador, no en la llamada interna de resolve_treatment. ' +
        'junto al catálogo real. Usa los NOMBRES de los tratamientos tal cual están en el catálogo, ' +
        'nunca IDs. Ejemplo: "si el paciente es nuevo y pide un tratamiento concreto, lo recomendable ' +
        'es una cita de valoración; usa únicamente la opción de valoración que figure en serviceCatalog. ' +
        'No confundir con treatmentPolicyHints, que trata de políticas de scheduling.',
    },
    treatmentPolicyHints: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          treatmentId: { type: ['string', 'null'] },
          treatmentName: { type: ['string', 'null'] },
          categoryId: { type: ['string', 'null'] },
          categoryName: { type: ['string', 'null'] },
          reason: { type: 'string' },
          recommendedPolicies: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: {
                  type: 'string',
                  enum: ['allowed_days', 'allowed_hours', 'allowed_professionals', 'min_notice', 'start_minutes'],
                },
                description: { type: 'string' },
                whyNotInStructuredLogic: { type: 'string' },
              },
              required: ['type', 'description', 'whyNotInStructuredLogic'],
              additionalProperties: false,
            },
          },
        },
        required: ['treatmentId', 'treatmentName', 'categoryId', 'categoryName', 'reason', 'recommendedPolicies'],
        additionalProperties: false,
      },
    },
    systemPromptInstructions: {
      type: 'object',
      properties: {
        notesForAdvisor: { type: 'array', items: { type: 'string' } },
        knownGaps: { type: 'array', items: { type: 'string' } },
        recommendedNextSteps: { type: 'array', items: { type: 'string' } },
      },
      required: ['notesForAdvisor', 'knownGaps', 'recommendedNextSteps'],
      additionalProperties: false,
    },
    conversationResumption: {
      type: 'object',
      properties: {
        instructions: {
          type: 'object',
          properties: {
            continuous: { type: ['string', 'null'] },
            short_break: { type: ['string', 'null'] },
            same_period: { type: ['string', 'null'] },
            recent: { type: ['string', 'null'] },
            distant: { type: ['string', 'null'] },
          },
          required: ['continuous', 'short_break', 'same_period', 'recent', 'distant'],
          additionalProperties: false,
        },
      },
      required: ['instructions'],
      additionalProperties: false,
    },
  },
  required: ['version', 'maxVisibleSlots', 'globalSchedulingPolicies', 'capabilities', 'intents', 'toolOrchestration', 'rules', 'identity', 'styleRules', 'responseTemplates', 'faq', 'serviceCatalog', 'protocols', 'errorCategories', 'treatmentSelectionGuidance', 'treatmentPolicyHints', 'systemPromptInstructions', 'conversationResumption'],
  additionalProperties: false,
} as const;
