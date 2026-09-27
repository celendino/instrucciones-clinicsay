#!/usr/bin/env node
/**
 * check-prompt-budget.js
 *
 * Verifica el presupuesto de tamaño del prompt de una sede (política aprobada
 * 2026-09-22: los fixes de incidentes se implementan como guardarraíles
 * deterministas del backend con test; solo se añade una regla al prompt cuando
 * expresa política de negocio de la clínica que el backend no puede conocer).
 *
 * FALLA (exit 1) si:
 *   - styleRules.additionalRules supera 8.000 caracteres (suma de textos), o
 *   - la estimación del prompt renderizado supera 45.000 caracteres.
 *
 * La estimación replica las secciones que el backend inyecta al system prompt
 * (ver scripts/lib/prompt-budget.cjs). systemPromptInstructions es builder-only
 * y no cuenta.
 *
 * validate-and-save.js ejecuta esta misma medición y la reporta como warning
 * NO bloqueante; este script es el gate explícito para correr antes de publicar.
 *
 * Usage:
 *   node scripts/check-prompt-budget.js --sede <SEDE> --mode <full|tasks-only>
 */

// NOTE: This script runs in an ESM project (package.json { "type": "module" }).
// We use createRequire to access existing CommonJS utilities under scripts/lib/*.cjs
// without changing their module system.
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const fs = require('fs');
const { getSedePaths, getActiveJsonPath } = require('./lib/paths.cjs');
const { measurePromptBudget } = require('./lib/prompt-budget.cjs');
const logger = require('./lib/logger.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const sedeIdx = args.indexOf('--sede');
  const modeIdx = args.indexOf('--mode');
  return {
    sede: sedeIdx >= 0 ? args[sedeIdx + 1] : null,
    // Mode is mandatory (no fallback), matching the backend validator.
    mode: modeIdx >= 0 ? args[modeIdx + 1] : null,
  };
}

function main() {
  const { sede, mode } = parseArgs();
  if (!sede || !mode || (mode !== 'full' && mode !== 'tasks-only')) {
    logger.error('Usage: node scripts/check-prompt-budget.js --sede <SEDE> --mode <full|tasks-only>');
    process.exit(1);
  }

  const paths = getSedePaths(sede, mode);
  // Check the active draft when present; fall back to the final otherwise.
  const jsonPath = getActiveJsonPath(paths);

  if (!fs.existsSync(jsonPath)) {
    logger.error(`JSON no encontrado: ${jsonPath}`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const report = measurePromptBudget(data);

  const result = {
    status: report.withinBudget ? 'within_budget' : 'over_budget',
    sede,
    mode,
    checked_at: new Date().toISOString(),
    file: jsonPath,
    ...report,
  };

  if (report.withinBudget) {
    logger.info(
      `Prompt budget OK: additionalRules ${report.additionalRules.chars}/${report.budgets.additionalRulesChars} chars, ` +
      `renderizado estimado ${report.renderedPrompt.chars}/${report.budgets.renderedPromptChars} chars`,
    );
  } else {
    for (const breach of report.breaches) {
      logger.error(`Presupuesto excedido: ${breach.metric} = ${breach.measured} chars (presupuesto ${breach.budget})`);
    }
    logger.error(
      'Política: los fixes de incidentes van al backend como guardarraíl determinista (con test), no al prompt. ' +
      'Solo política de negocio de la clínica que el backend no puede conocer justifica reglas de prompt. ' +
      'Ver structured-logic-standards.md, sección "Prompt Budget".',
    );
  }

  console.log(JSON.stringify(result, null, 2));
  process.exit(report.withinBudget ? 0 : 1);
}

main();
