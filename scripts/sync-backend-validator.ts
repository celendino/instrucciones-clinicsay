/**
 * Copies the authoritative instruction-builder validator from the sibling
 * backend repository into a generated, local runtime tree.
 *
 * The generated tree is intentionally ignored by Git. Never edit it manually.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const instructionsRoot = path.resolve(scriptsDir, '..');
const backendRoot = path.resolve(instructionsRoot, '../clinicsay-backend');
const generatedRoot = path.join(scriptsDir, '.generated/backend-validator');

const sourceDirectories = [
  'src/domain/chat',
  'src/domain/chatbot-instruction-builder',
  'src/ports/secondary/chat',
];

export function syncBackendValidator(): void {
  const validator = path.join(backendRoot, 'src/domain/chatbot-instruction-builder/validator.ts');
  if (!fs.existsSync(validator)) {
    throw new Error(`Backend validator not found at ${validator}`);
  }

  fs.rmSync(generatedRoot, { recursive: true, force: true });
  for (const relativeDirectory of sourceDirectories) {
    const source = path.join(backendRoot, relativeDirectory);
    const destination = path.join(generatedRoot, relativeDirectory);
    if (!fs.existsSync(source)) {
      throw new Error(`Backend validator dependency not found at ${source}`);
    }
    fs.cpSync(source, destination, { recursive: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  syncBackendValidator();
  console.log(`Synchronized backend validator from ${backendRoot}`);
}
