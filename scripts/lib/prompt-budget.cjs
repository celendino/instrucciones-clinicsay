/**
 * prompt-budget.cjs
 *
 * Prompt size budget for StructuredLogic JSONs (policy approved 2026-09-22:
 * incident fixes belong in deterministic backend guardrails with tests, not in
 * accumulated prompt rules).
 *
 * Budgets:
 *   - styleRules.additionalRules: sum of rule texts must be <= 8,000 chars.
 *   - Rendered prompt estimate: must be <= 45,000 chars.
 *
 * The rendered estimate replicates the sections the backend injects into the
 * system prompt from this JSON (clinicsay-backend:
 * src/application/chat/build-system-prompt/base.ts):
 *   identity, styleRules, serviceCatalog, treatmentSelectionGuidance,
 *   responseTemplates, intents, toolOrchestration.flows, protocols catalog and
 *   conversationResumption.
 * Excluded on purpose:
 *   - systemPromptInstructions (builder-only; the backend never renders it).
 *   - appointmentReason and timeBands (static backend text, not JSON-driven).
 *   - The runtime overlay (conversation state; not part of the JSON).
 * Runtime placeholders ({{CLINIC_NAME}} etc.) are measured unresolved, so the
 * estimate is a floor, not an exact size.
 */

'use strict';

const PROMPT_BUDGET = Object.freeze({
  additionalRulesChars: 8000,
  renderedPromptChars: 45000,
});

// Mirror of build-system-prompt/render-section.ts
function renderSection(title, content) {
  if (!content || content.trim().length === 0) return '';
  return `\n\n--- ${title} ---\n${content.trim()}`;
}

function asStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];
}

// Mirror of build-system-prompt/render-identity.ts (placeholders unresolved)
function estimateIdentity(logic) {
  const identity = logic && typeof logic.identity === 'object' && logic.identity !== null ? logic.identity : null;
  if (!identity || Object.keys(identity).length === 0) return '';

  const parts = [];
  if (identity.botName) parts.push(`Nombre del asistente: ${identity.botName}`);
  if (identity.clinicName) parts.push(`Clinica: ${identity.clinicName}`);
  if (identity.persona) parts.push(`Persona: ${identity.persona}`);
  if (identity.tone) parts.push(`Tono: ${identity.tone}`);
  if (identity.address) parts.push(`Direccion: ${identity.address}`);
  if (identity.phone) parts.push(`Telefono: ${identity.phone}`);
  if (identity.email) parts.push(`Email: ${identity.email}`);
  if (identity.website) parts.push(`Web: ${identity.website}`);
  if (identity.openingHours) parts.push(`Horario: ${identity.openingHours}`);
  if (identity.language) {
    parts.push(`Idioma: ${identity.language === 'auto' ? 'detectar automaticamente el idioma del paciente' : identity.language}`);
  }
  if (identity.farewellMessage) parts.push(`Mensaje de despedida: ${identity.farewellMessage}`);
  if (identity.escalationMessage) parts.push(`Mensaje de escalacion: ${identity.escalationMessage}`);
  if (Array.isArray(identity.socialLinks) && identity.socialLinks.length > 0) {
    parts.push(
      `Redes sociales:\n${identity.socialLinks
        .map((link) => `- ${link.platform}: ${link.url}`)
        .join('\n')}`,
    );
  }
  if (Array.isArray(identity.additionalContacts) && identity.additionalContacts.length > 0) {
    parts.push(
      `Otros contactos:\n${identity.additionalContacts
        .map((contact) => {
          const label = contact.label ? ` (${contact.label})` : '';
          return `- ${contact.type}${label}: ${contact.value}`;
        })
        .join('\n')}`,
    );
  }

  return renderSection('Identidad y datos de contacto', parts.join('\n'));
}

// Mirror of build-system-prompt/render-style-rules.ts
function estimateStyleRules(logic) {
  const style = logic && typeof logic.styleRules === 'object' && logic.styleRules !== null ? logic.styleRules : null;
  if (!style || Object.keys(style).length === 0) return '';

  const rules = [];
  if (style.brevity) rules.push(`BREVEDAD: ${style.brevity}.`);
  if (style.format) rules.push(`FORMATO: ${style.format}.`);
  if (style.tone) rules.push(`TONO: ${style.tone}.`);
  if (style.emojiPolicy) {
    const emojiText = style.emojiPolicy === 'allowed'
      ? 'Los emojis estan permitidos cuando encajen.'
      : style.emojiPolicy === 'forbidden'
        ? 'PROHIBIDO usar emojis o emoticonos en los mensajes al paciente.'
        : 'Usa emojis solo en contextos especificos permitidos.';
    rules.push(`EMOJIS: ${emojiText}`);
  }
  if (style.languagePolicy) rules.push(`IDIOMA: ${style.languagePolicy === 'auto' ? 'responde siempre en el idioma del paciente' : `responde en ${style.languagePolicy}`}.`);
  if (style.noMedicalDiagnosis) rules.push('PROHIBIDO: diagnosticar, interpretar sintomas, valorar lesiones o dar ejercicios/pautas/clinicas.');
  if (style.noAsterisks) rules.push('PROHIBIDO: usar asteriscos, negritas o cursivas.');
  if (style.noMarkdown) rules.push('PROHIBIDO: usar markdown, listas o almohadillas.');
  if (style.maxSentences) rules.push(`MAXIMO: ${style.maxSentences} oraciones por respuesta salvo que se indique lo contrario.`);
  if (style.maxWordsPerSentence) rules.push(`MAXIMO: ${style.maxWordsPerSentence} palabras por oracion.`);
  const avoidPhrases = asStringArray(style.avoidPhrases);
  if (avoidPhrases.length > 0) rules.push(`FRASES PROHIBIDAS: ${avoidPhrases.join('; ')}`);
  const mandatoryPhrases = asStringArray(style.mandatoryPhrases);
  if (mandatoryPhrases.length > 0) rules.push(`FRASES OBLIGATORIAS: ${mandatoryPhrases.join('; ')}`);
  const additionalRules = asStringArray(style.additionalRules);
  if (additionalRules.length > 0) rules.push(...additionalRules.map((rule) => `REGLA ADICIONAL: ${rule}`));
  if (style.mustOfferHumanHandoff) rules.push('OBLIGATORIO: ofrecer escalacion a un humano cuando la solicitud lo requiera.');
  if (Array.isArray(style.timeGreetingRanges) && style.timeGreetingRanges.length > 0) {
    const rangesText = style.timeGreetingRanges
      .filter((r) => r && typeof r === 'object')
      .map((r) => `- ${r.label}: ${r.start}-${r.end} -> ${r.greeting}`)
      .join('\n');
    rules.push(`Rangos de saludo por hora:\n${rangesText}`);
    rules.push('Si decides saludar al paciente, usa el saludo correcto segun la hora local (LOCAL_TIME) y los rangos configurados.');
  }

  return renderSection('Reglas de estilo', rules.join('\n'));
}

// Mirror of build-system-prompt/render-service-catalog.ts
function estimateServiceCatalog(logic) {
  const catalog = logic && typeof logic.serviceCatalog === 'object' && logic.serviceCatalog !== null ? logic.serviceCatalog : null;
  if (!catalog) return '';

  const renderEntry = (entry) => {
    const lines = [`- ${entry.name}`];
    if (entry.description) lines.push(`  Descripcion: ${entry.description}`);
    if (entry.priceDescription) lines.push(`  Precio: ${entry.priceDescription}`);
    if (entry.requiresConsultation) lines.push(`  Requiere consulta previa: si`);
    return lines.join('\n');
  };

  const parts = [];
  const treatments = Array.isArray(catalog.treatments) ? catalog.treatments : [];
  if (treatments.length > 0) {
    parts.push(`TRATAMIENTOS:\n${treatments.map(renderEntry).join('\n')}`);
  }
  const packs = Array.isArray(catalog.packs) ? catalog.packs : [];
  if (packs.length > 0) {
    parts.push(`PACKS:\n${packs.map(renderEntry).join('\n')}`);
  }
  if (parts.length === 0) return '';
  return renderSection(
    'Catalogo de servicios',
    `Cuando el paciente pregunte por precios o tratamientos, usa esta informacion. Si no hay precio exacto, indica que debe consultar en clinica.\n${parts.join('\n\n')}`,
  );
}

// Mirror of build-system-prompt/render-treatment-selection-guidance.ts
function estimateTreatmentSelectionGuidance(logic) {
  const guidance = logic && typeof logic.treatmentSelectionGuidance === 'string' ? logic.treatmentSelectionGuidance : null;
  if (!guidance || guidance.trim().length === 0) return '';

  return renderSection(
    'Orientacion para seleccionar tratamiento',
    `${guidance.trim()}
Regla del orquestador: pregunta solo si la conversacion o el contexto no aclaran si es la primera vez y la guia contiene la politica aplicable. Si ya esta claro, resuelve directamente sin preguntar de nuevo.
Al resolver, construye clarifiedTreatmentRequest identificando explicitamente el tratamiento. Si es una valoracion, incluye el nombre exacto y el area tomados de esta guia o del serviceCatalog de esta sede; nunca inventes nombres.
Despues de resolve_patient, usa isNew/source de su salida para confirmar si el paciente es nuevo o existente antes de continuar.`,
  );
}

// Mirror of build-system-prompt/render-response-templates.ts (placeholders unresolved)
function estimateResponseTemplates(logic) {
  const templates = logic && typeof logic.responseTemplates === 'object' && logic.responseTemplates !== null ? logic.responseTemplates : null;
  if (!templates || Object.keys(templates).length === 0) return '';

  const entries = Object.entries(templates)
    .map(([key, value]) => {
      const text = value && typeof value === 'object' && typeof value.text === 'string' ? value.text : '';
      const mode = value && typeof value === 'object' && value.mode === 'literal' ? 'literal' : 'model';
      const modeHint = mode === 'model'
        ? ' (modelo: adaptar al paciente manteniendo la informacion clave y el tono)'
        : ' (literal: usar exactamente este texto)';
      return `- ${key}: "${text}"${modeHint}`;
    })
    .join('\n');
  return renderSection(
    'Mensajes modelo de referencia',
    `Usa estos textos como referencia cuando aplique la situacion correspondiente:\n${entries}`,
  );
}

// Mirror of build-system-prompt/render-intents.ts
function estimateIntents(logic) {
  const intents = logic && typeof logic.intents === 'object' && logic.intents !== null ? logic.intents : null;
  if (!intents || Object.keys(intents).length === 0) return '';

  const entries = Object.entries(intents)
    .map(([id, def]) => `- ${id}: ${def && typeof def === 'object' ? def.description : ''}`)
    .join('\n');
  return renderSection('Catálogo de intenciones', entries);
}

// Mirror of build-system-prompt/render-flows.ts
function estimateFlows(logic) {
  const flows = logic && logic.toolOrchestration && typeof logic.toolOrchestration.flows === 'object' && logic.toolOrchestration.flows !== null
    ? logic.toolOrchestration.flows
    : null;
  if (!flows || Object.keys(flows).length === 0) return '';

  const entries = Object.entries(flows)
    .map(([name, flow]) => {
      const steps = (Array.isArray(flow.steps) ? flow.steps : [])
        .map((s) => {
          const notePart = s.note ? ` - ${s.note}` : '';
          return `  Paso ${s.step}: ${s.parallel ? 'en paralelo' : 'secuencial'} [${asStringArray(s.tools).join(', ')}]${notePart}`;
        })
        .join('\n');
      return `- ${name} (${flow.intent}): ${flow.description}\n${steps}`;
    })
    .join('\n\n');
  return renderSection('Flujos de conversacion', entries);
}

// Mirror of build-system-prompt/render-protocols.ts (catalog only: id + name)
function estimateProtocols(logic) {
  const protocols = logic && typeof logic.protocols === 'object' && logic.protocols !== null ? logic.protocols : null;
  if (!protocols || Object.keys(protocols).length === 0) return '';

  const catalog = Object.entries(protocols)
    .map(([id, p]) => `- ${id}: ${p && typeof p === 'object' ? p.name : ''}`)
    .join('\n');
  return renderSection(
    'Protocolos disponibles',
    `Puedes usar la herramienta query_protocol(protocolId) para obtener el contenido completo de cualquier protocolo cuando el paciente lo pregunte.\n${catalog}`,
  );
}

// Mirror of build-system-prompt/render-runtime-context.ts (renderConversationResumption)
function estimateConversationResumption(logic) {
  const cr = logic && typeof logic.conversationResumption === 'object' && logic.conversationResumption !== null
    ? logic.conversationResumption
    : null;
  const instructions = cr && typeof cr.instructions === 'object' && cr.instructions !== null ? cr.instructions : null;
  if (!instructions || Object.keys(instructions).length === 0) return '';

  const lines = Object.entries(instructions)
    .filter(([, text]) => !!text)
    .map(([type, text]) => `- ${type}: ${text}`)
    .join('\n');
  if (!lines) return '';
  return renderSection(
    'Instrucciones de reanudacion conversacional',
    `Segun el tiempo transcurrido desde el ultimo mensaje del bot (CONVERSATION_RESUMPTION_TYPE), sigue estas instrucciones de estilo:\n${lines}`,
  );
}

/**
 * Measure what a StructuredLogic JSON contributes to the rendered system prompt.
 * Never throws: malformed sections are estimated defensively (schema errors are
 * reported by validate-and-save.js, not here).
 *
 * @param {object} logic Parsed StructuredLogic JSON.
 * @returns {{
 *   budgets: { additionalRulesChars: number, renderedPromptChars: number },
 *   additionalRules: { count: number, chars: number },
 *   renderedPrompt: { chars: number, sections: Record<string, number> },
 *   breaches: Array<{ metric: string, measured: number, budget: number }>,
 *   withinBudget: boolean,
 * }}
 */
function measurePromptBudget(logic) {
  const safeLogic = logic && typeof logic === 'object' ? logic : {};
  const style = safeLogic.styleRules && typeof safeLogic.styleRules === 'object' ? safeLogic.styleRules : {};
  const additionalRules = asStringArray(style.additionalRules);
  const additionalRulesChars = additionalRules.reduce((sum, rule) => sum + rule.length, 0);

  const sections = {
    identity: estimateIdentity(safeLogic),
    styleRules: estimateStyleRules(safeLogic),
    serviceCatalog: estimateServiceCatalog(safeLogic),
    treatmentSelectionGuidance: estimateTreatmentSelectionGuidance(safeLogic),
    responseTemplates: estimateResponseTemplates(safeLogic),
    intents: estimateIntents(safeLogic),
    flows: estimateFlows(safeLogic),
    protocols: estimateProtocols(safeLogic),
    conversationResumption: estimateConversationResumption(safeLogic),
  };
  // Mirror of base.ts: parts.join('').trim()
  const renderedPromptChars = Object.values(sections).join('').trim().length;
  const sectionChars = Object.fromEntries(Object.entries(sections).map(([key, value]) => [key, value.length]));

  const breaches = [];
  if (additionalRulesChars > PROMPT_BUDGET.additionalRulesChars) {
    breaches.push({
      metric: 'styleRules.additionalRules',
      measured: additionalRulesChars,
      budget: PROMPT_BUDGET.additionalRulesChars,
    });
  }
  if (renderedPromptChars > PROMPT_BUDGET.renderedPromptChars) {
    breaches.push({
      metric: 'renderedPromptEstimate',
      measured: renderedPromptChars,
      budget: PROMPT_BUDGET.renderedPromptChars,
    });
  }

  return {
    budgets: { ...PROMPT_BUDGET },
    additionalRules: { count: additionalRules.length, chars: additionalRulesChars },
    renderedPrompt: { chars: renderedPromptChars, sections: sectionChars },
    breaches,
    withinBudget: breaches.length === 0,
  };
}

module.exports = { PROMPT_BUDGET, measurePromptBudget };
