/**
 * Push final structuredLogic JSONs from each sede output directory into active bots.
 *
 * Only files that exist are updated:
 *   structured-logic.full.json       -> metadata.structuredLogicFull
 *   structured-logic.tasks-only.json -> metadata.structuredLogic
 *
 * Usage:
 *   npx tsx scripts/push-sedes-to-db.ts
 *   npx tsx scripts/push-sedes-to-db.ts --sede <SEDE>
 *   CONFIRM=1 npx tsx scripts/push-sedes-to-db.ts --sede <SEDE>
 */

import 'dotenv/config';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { Client } from 'pg';
import { loadAuthoritativeValidator } from './lib/backend-validator/authoritative-validator';

const require = createRequire(import.meta.url);
const {
  readPushFiles,
  buildMetadataPatch,
  describeDatabase,
  getSedeDirName,
} = require('./lib/push-sedes.cjs');

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DATABASE_URL = process.env.DATABASE_URL;

function parseArgs() {
  const args = process.argv.slice(2);
  const sedeIndex = args.indexOf('--sede');
  return {
    sede: sedeIndex >= 0 ? args[sedeIndex + 1] : process.env.SEDE || null,
  };
}

function formatDatabase(info: ReturnType<typeof describeDatabase>) {
  return [
    `  Host: ${info.host}`,
    `  Puerto: ${info.port}`,
    `  Base de datos: ${info.database}`,
    `  Schema: ${info.schema}`,
    `  Usuario: ${info.user}`,
  ].join('\n');
}

function validatePushFiles(
  pushes: Array<{ sede: string; modes: Array<{ mode: string; filePath: string; data: unknown }> }>,
  validateStructuredLogic: (data: unknown, mode: string) => { valid: boolean; errors: string[] },
) {
  const errors: string[] = [];
  for (const push of pushes) {
    for (const mode of push.modes) {
      const result = validateStructuredLogic(mode.data, mode.mode);
      if (!result.valid) {
        errors.push(`${push.sede}/${path.basename(mode.filePath)}:\n${result.errors.map((error) => `  - ${error}`).join('\n')}`);
      }
    }
  }
  return errors;
}

async function confirm(prompt: string) {
  if (process.env.CONFIRM === '1') return true;
  if (!input.isTTY || !output.isTTY) {
    throw new Error('No hay terminal interactiva. Usa CONFIRM=1 solo después de revisar el destino.');
  }
  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question(`${prompt} [y/N]: `);
    return ['y', 'yes', 'si', 'sí'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

async function main() {
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL no está configurada.');
  }

  const { sede } = parseArgs();
  const pushes = readPushFiles(ROOT, sede);
  if (pushes.length === 0) {
    console.log(sede
      ? `No hay JSONs finales en output para la sede '${sede}'. No se actualizó nada.`
      : 'No hay JSONs finales en output. No se actualizó nada.');
    return;
  }

  const { validateStructuredLogic } = await loadAuthoritativeValidator();
  const validationErrors = validatePushFiles(pushes, validateStructuredLogic);
  if (validationErrors.length > 0) {
    throw new Error(`Hay JSONs inválidos. Corrígelos antes del push:\n${validationErrors.join('\n')}`);
  }

  const dbInfo = describeDatabase(DATABASE_URL);
  console.log('\nBase de datos destino:\n' + formatDatabase(dbInfo));
  console.log('\nArchivos detectados:');
  for (const push of pushes) {
    console.log(`  - ${push.sede}: ${push.modes.map((mode: { mode: string }) => mode.mode).join(', ')}`);
  }

  const dbUrl = new URL(DATABASE_URL);
  dbUrl.searchParams.delete('sslmode');
  const client = new Client({
    connectionString: dbUrl.toString(),
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  try {
    const result = await client.query(`
      SELECT
        kb.id AS bot_id,
        s.slug AS site_slug,
        o.name AS org_name,
        c.name AS clinic_name,
        s.name AS site_name
      FROM kommo_bot kb
      JOIN site s ON s.id = kb.site_id
      JOIN clinic c ON c.id = kb.clinic_id
      JOIN organization o ON o.id = c.organization_id
      WHERE kb.bot_type = 'CHAT_BOT'
        AND kb.record_status = 'ACTIVE'
        AND s.record_status = 'ACTIVE'
        AND c.record_status = 'ACTIVE'
        AND o.record_status = 'ACTIVE'
      ORDER BY o.name, c.slug, s.slug, kb.id
    `);

    const targets = result.rows.filter((row) => {
      const rowSede = getSedeDirName(row.org_name, row.site_slug);
      return pushes.some((push) => push.sede === rowSede);
    });

    if (targets.length === 0) {
      throw new Error('No se encontraron bots activos que correspondan a los JSON detectados.');
    }

    console.log('\nBots destino:');
    for (const target of targets) {
      console.log(`  - ${target.bot_id}: ${target.org_name} → ${target.clinic_name} → ${target.site_name}`);
    }

    const shouldPush = await confirm('\n¿Confirmas ejecutar el push en esta base de datos?');
    if (!shouldPush) {
      console.log('Push cancelado. No se modificó la base de datos.');
      return;
    }

    await client.query('BEGIN');
    for (const target of targets) {
      const sede = getSedeDirName(target.org_name, target.site_slug);
      const push = pushes.find((candidate) => candidate.sede === sede)!;
      const metadataPatch = buildMetadataPatch(push.modes);
      await client.query(
        `UPDATE kommo_bot
         SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb
         WHERE id = $2`,
        [JSON.stringify(metadataPatch), target.bot_id],
      );
      console.log(`  ✓ Actualizado ${sede}: ${push.modes.map((mode: { mode: string }) => mode.mode).join(', ')}`);
    }
    await client.query('COMMIT');
    console.log(`\nPush completado. ${targets.length} bot(s) actualizado(s).`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(`ERROR en push: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
