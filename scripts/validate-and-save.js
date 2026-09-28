#!/usr/bin/env node
/**
 * validate-and-save.js
 *
 * Validates structuredLogic draft against schema, cross-references, and mode compliance.
 * If valid: copies structured-logic.<mode>.draft.json to structured-logic.<mode>.json
 * If invalid: reports categorized errors and exits 1.
 *
 * Usage:
 *   node scripts/validate-and-save.js --sede <SEDE> --mode <full|tasks-only>
 */

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

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

/**
 * Validation is centralized in scripts/lib/backend-validator/run-validation.ts.
 * This script only selects the active draft, invokes that validator and promotes
 * the exact validated file when it passes.
 */

function main() {
  const { sede, mode } = parseArgs();
  if (!sede || !mode || (mode !== 'full' && mode !== 'tasks-only')) {
    logger.error('Usage: node scripts/validate-and-save.js --sede <SEDE> --mode <full|tasks-only>');
    process.exit(1);
  }

  const paths = getSedePaths(sede, mode);

  // The draft is the active working document. Prefer it whenever present so
  // validation never succeeds against a stale final while a newer draft exists.
  const jsonPath = getActiveJsonPath(paths);
  if (!fs.existsSync(jsonPath)) {
    logger.error(`JSON not found: ${jsonPath}`);
    logger.info('Generate the JSON first. The agent creates it by reading anotaciones.md and prompts.');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

  // ── Prompt budget (policy 2026-09-22: incident fixes belong in deterministic ──
  // ── backend guardrails, not in accumulated prompt rules). Advisory only:     ──
  // ── breaches surface as NON-blocking warnings, same philosophy as gaps.      ──
  // ── The blocking gate is scripts/check-prompt-budget.js.                     ──
  const promptBudget = measurePromptBudget(data);

  // ── Backend-real validation (replicated, not imported from external repo) ──
  // Output shape: { valid, errors, gaps, qualityScore }
  //   - errors: blocking (prevent saving)
  //   - gaps: NON-blocking (severity high|medium|low|advisory; advisory = canonical mode notes)
  const { execSync } = require('child_process');
  const path = require('path');
  const validatorScript = path.join(__dirname, 'lib', 'backend-validator', 'run-validation.ts');
  let backendResult;
  try {
    const stdout = execSync(
      `npx tsx "${validatorScript}" "${jsonPath}" "${mode}"`,
      { encoding: 'utf8', cwd: path.join(__dirname, '..'), shell: true, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    backendResult = JSON.parse(stdout);
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    // If the validator emitted valid JSON to stdout even on non-zero exit, use it
    try {
      backendResult = JSON.parse(stdout);
    } catch {
      // Never save on a validator runtime failure. The old structural fallback
      // could accept drafts that the replicated backend validator would reject.
      const detail = stderr.trim() || 'unknown validator execution error';
      backendResult = {
        valid: false,
        errors: [`Backend validator could not run: ${detail}`],
        gaps: [],
        qualityScore: { score: 0, max: 94, gaps: ['validator execution failed; draft was not saved'] },
      };
    }
  }

  const allErrors = [...(backendResult.errors || [])];
  const gaps = backendResult.gaps || [];
  const qualityScore = backendResult.qualityScore || null;

  for (const breach of promptBudget.breaches) {
    gaps.push({
      severity: 'high',
      type: 'prompt_budget',
      description: `Prompt budget exceeded: ${breach.metric} = ${breach.measured} chars (budget ${breach.budget}). Incident fixes belong in deterministic backend guardrails (with tests), not in accumulated prompt rules — see structured-logic-standards.md, "Prompt Budget". Full report: node scripts/check-prompt-budget.js --sede <SEDE> --mode <full|tasks-only>.`,
    });
  }

  const promptBudgetSummary = {
    withinBudget: promptBudget.withinBudget,
    additionalRulesChars: promptBudget.additionalRules.chars,
    renderedPromptChars: promptBudget.renderedPrompt.chars,
    budgets: promptBudget.budgets,
  };

  if (backendResult.valid && allErrors.length === 0) {
    // Valid: promote the exact draft that was validated.
    if (jsonPath === paths.draft) {
      fs.copyFileSync(paths.draft, paths.final);
    }
    logger.info(`✅ Valid structuredLogic (${mode} mode)`);
    logger.info(`Validated ${jsonPath}`);
    if (jsonPath === paths.draft) {
      logger.info(`Promoted draft to ${paths.final}`);
    }

    // Non-blocking gaps: educate, never block (backend advisory philosophy)
    if (gaps.length > 0) {
      logger.warn(`⚠️  ${gaps.length} warning(s) — NO bloqueantes:`);
      for (const g of gaps) {
        const sev = (g.severity || 'info').toUpperCase();
        logger.warn(`    [${sev}] ${g.description || g}`);
      }
    }
    if (qualityScore) {
      logger.info(`Quality score: ${qualityScore.score}/${qualityScore.max}`);
    }

    // Print summary
    const summary = {
      status: 'valid',
      mode,
      intents: Object.keys(data.intents || {}).length,
      flows: Object.keys(data.toolOrchestration?.flows || {}).length,
      rules: (data.rules || []).length,
      templates: Object.keys(data.responseTemplates || {}).length,
      warnings: gaps.map(g => ({ severity: g.severity, type: g.type, description: g.description })),
      qualityScore,
      promptBudget: promptBudgetSummary,
      file: paths.final,
    };
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  } else {
    // Invalid: report errors
    logger.error(`❌ ${allErrors.length} validation error(s):`);
    const byCategory = {};
    // Categorize backend errors
    for (const e of allErrors) {
      const msg = typeof e === 'string' ? e : (e.message || String(e));
      // Simple heuristic categorization
      let cat = 'schema';
      if (msg.includes('intent') && (msg.includes('references') || msg.includes('Missing'))) cat = 'cross-ref';
      if (msg.includes('scheduling') || msg.includes('tasks-only') || msg.includes('create_task')) cat = 'mode';
      if (msg.includes('responseTemplate')) cat = 'business';
      byCategory[cat] = byCategory[cat] || [];
      byCategory[cat].push(msg);
    }

    for (const [cat, msgs] of Object.entries(byCategory)) {
      logger.error(`  [${cat.toUpperCase()}] ${msgs.length} error(s):`);
      for (const m of msgs) {
        logger.error(`    - ${m}`);
      }
    }

    console.log(JSON.stringify({ status: 'invalid', errors: byCategory, promptBudget: promptBudgetSummary }, null, 2));
    process.exit(1);
  }
}

main();
