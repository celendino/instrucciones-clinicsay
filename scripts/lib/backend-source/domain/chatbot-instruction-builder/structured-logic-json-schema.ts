/**
 * JSON Schema for StructuredLogic — RUNTIME MAP FORMAT.
 *
 * This schema describes the runtime map format: { [key]: value } for
 * intents, flows, protocols, and responseTemplates. It uses
 * `additionalProperties` for dynamic keys.
 *
 * PURPOSE:
 * - Runtime validator (`validateStructuredLogic`) reference.
 * - Human-readable docs and builder tool `get_schema` legacy.
 *
 * NOT used by the LLM for structured output. The LLM uses
 * `StructuredLogicWireJsonSchema` (entry arrays) because OpenAI strict:true
 * does not support dynamic keys.
 *
 * @see StructuredLogicWireJsonSchema — wire format used by the LLM.
 */

import { ALL_CHAT_TOOLS } from '../chat/tool-definitions-full';
import { ALL_CHAT_TOOLS_TASKS_ONLY } from '../chat/tool-definitions-tasks-only';

export const ALL_CHAT_TOOL_NAMES = [
  ...new Set([...ALL_CHAT_TOOLS.map((t) => t.name), ...ALL_CHAT_TOOLS_TASKS_ONLY.map((t) => t.name)]),
] as const;

export const StructuredLogicJsonSchema = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    maxVisibleSlots: { type: 'integer', minimum: 1, maximum: 50 },
    globalSchedulingPolicies: {
      type: 'array',
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
        bookingMode: {
          type: ['string', 'null'],
          enum: ['direct', 'confirm-first'],
          description: 'Modo de agendamiento de la clínica: direct = agendar al elegir slot (default recomendado); confirm-first = pedir confirmación explícita antes de schedule_block.',
        },
      },
      required: ['sensitiveSituations', 'protocols'],
    },
    intents: {
      type: 'object',
      description: 'Semantic intent catalog. Every intent referenced by flows and rules MUST be declared here. The intent classifier reads these descriptions to match patient messages.',
      additionalProperties: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          examples: { type: ['array', 'null'], items: { type: 'string' } },
        },
        required: ['description'],
        additionalProperties: false,
      },
    },
    toolOrchestration: {
      type: 'object',
      properties: {
        flows: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              intent: { type: 'string' },
              description: { type: ['string', 'null'] },
              selection: {
                type: ['object', 'null'],
                properties: {
                  requiredCapabilities: { type: ['array', 'null'], items: { type: 'string' } },
                  alternativeRequiredCapabilities: { type: ['array', 'null'], items: { type: 'string' } },
                  excludedCapabilities: { type: ['array', 'null'], items: { type: 'string' } },
                },
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
                    required: { type: 'array', items: { type: 'string' } },
                    note: { type: ['string', 'null'] },
                  },
                  required: ['step', 'tools', 'parallel'],
                  additionalProperties: false,
                },
              },
                responseTemplateKey: { type: ['string', 'null'], description: 'Optional key into the responseTemplates registry.' },
              allowedTools: { type: ['array', 'null'], items: { type: 'string', enum: ALL_CHAT_TOOL_NAMES } },
              allowsSilence: { type: ['boolean', 'null'] },
            },
            required: ['intent', 'description', 'steps'],
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
                value: {},
                negated: { type: ['boolean', 'null'] },
                note: { type: ['string', 'null'] },
              },
              required: ['field', 'operator', 'value'],
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
        required: ['id', 'intent', 'description', 'action'],
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
        // 'auto' or a fixed language code (e.g. 'es', 'en').
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
            required: ['type', 'value'],
            additionalProperties: false,
          },
        },
      },
      additionalProperties: false,
    },
    styleRules: {
      type: 'object',
      properties: {
        brevity: { type: ['string', 'null'] },
        format: { type: ['string', 'null'] },
        tone: { type: ['string', 'null'] },
        emojiPolicy: { type: ['string', 'null'], enum: ['allowed', 'forbidden', 'contextual'] },
        // 'auto' or a fixed language code (e.g. 'es', 'en').
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
      additionalProperties: false,
    },
    responseTemplates: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          text: { type: ['string', 'null'] },
          mode: { type: ['string', 'null'], enum: ['literal', 'model'] },
        },
        required: ['text'],
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
        required: ['question', 'answer'],
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
            required: ['name'],
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
            required: ['name'],
            additionalProperties: false,
          },
        },
      },
      required: ['treatments'],
      additionalProperties: false,
    },
    protocols: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          responseTemplate: { type: ['string', 'null'] },
          sections: { type: ['array', 'null'], items: { type: 'string' } },
        },
        required: ['name', 'description', 'responseTemplate'],
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
        required: ['id', 'description', 'suggestions'],
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
        required: ['reason', 'recommendedPolicies'],
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
          additionalProperties: false,
        },
      },
      required: ['instructions'],
      additionalProperties: false,
    },
  },
  required: ['version', 'capabilities', 'serviceCatalog', 'intents', 'toolOrchestration', 'rules'],
  additionalProperties: false,
} as const;
