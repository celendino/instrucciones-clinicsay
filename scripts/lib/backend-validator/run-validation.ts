/**
 * run-validation.ts
 *
 * Wrapper para ejecutar el validador replicado del backend.
 * Emite resultado JSON a stdout:
 *   - errors: bloqueantes (impiden guardar)
 *   - gaps: NO bloqueantes (incluye severity 'advisory' con notas canónicas del modo)
 *   - qualityScore: puntuación de calidad del borrador
 *
 * El modo es OBLIGATORIO (sin fallback), igual que en el backend.
 *
 * Uso:
 *   npx tsx scripts/lib/backend-validator/run-validation.ts <json-path> <full|tasks-only>
 *
 * Exit codes: 0 = válido · 1 = inválido · 2 = error de uso
 */

import fs from 'fs';
import { loadAuthoritativeValidator } from './authoritative-validator';

const jsonPath = process.argv[2];
const mode = process.argv[3];

if (!jsonPath || !fs.existsSync(jsonPath)) {
  console.error('Usage: npx tsx run-validation.ts <json-path> <full|tasks-only>');
  process.exit(2);
}

if (!mode || (mode !== 'full' && mode !== 'tasks-only')) {
  console.error('mode is required and must be "full" or "tasks-only"');
  process.exit(2);
}

async function main() {
  const logic = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const { validateStructuredLogic, detectGaps, generateQualityScore } = await loadAuthoritativeValidator();
  const { valid, errors } = validateStructuredLogic(logic, mode);

  // Igual que BuilderAgent.validateDraft en el backend: los gaps solo se calculan
  // cuando el borrador es válido (detectGaps asume estructura completa).
  const gaps = valid ? detectGaps(logic, mode) : [];
  const qualityScore = valid
    ? generateQualityScore(logic)
    : { score: 0, max: 94, gaps: ['structuredLogic is invalid; fix validation errors first'] };

  console.log(JSON.stringify({ valid, errors, gaps, qualityScore }));
  process.exit(valid ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
