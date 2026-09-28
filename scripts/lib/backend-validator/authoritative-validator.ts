import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBackendValidator } from '../../sync-backend-validator';

export async function loadAuthoritativeValidator() {
  syncBackendValidator();
  const validatorPath = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    '../../.generated/backend-validator/src/domain/chatbot-instruction-builder/validator.ts',
  );
  return import(pathToFileURL(validatorPath).href);
}
