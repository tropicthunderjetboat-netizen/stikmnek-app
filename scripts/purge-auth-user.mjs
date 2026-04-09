#!/usr/bin/env node
/**
 * Remove all public data for one Auth user, then delete auth.users row.
 *
 * One-time setup:
 *   1. Supabase Dashboard → Project Settings → Database
 *   2. Under "Connection string", choose URI, tab "Direct connection"
 *   3. Copy the string and replace [YOUR-PASSWORD] with your DB password
 *   4. Create file `.env.db.local` in the project root with one line:
 *        DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.xxxxx.supabase.co:5432/postgres
 *
 * Run:
 *   npm run db:purge-user -- PASTE-USER-UUID-HERE
 *
 * The UUID is the long id from Authentication → Users (same as in the dashboard URL).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function loadDatabaseUrl() {
  for (const f of ['.env.db.local', '.env.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const key = t.slice(0, i).trim();
      let val = t.slice(i + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key === 'DATABASE_URL' && val) return val;
    }
  }
  return process.env.DATABASE_URL || '';
}

function printHelp() {
  console.log(`
StikmNek — purge app data + delete Auth user
============================================

One-time: create .env.db.local in the project root:

  DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.XXXX.supabase.co:5432/postgres

Get the URL from: Supabase Dashboard → Settings → Database → Connection string → URI (Direct)

Then run (paste the user UUID from Authentication → Users):

  npm run db:purge-user -- 9be7fcd6-96d8-4c9a-bfd8-c7fd316933bd
`);
}

/** Statements that may be missing on some projects — ignore undefined_table / undefined_column */
const OPTIONAL_DELETES = [
  `DELETE FROM public.favorites WHERE user_id = $1::uuid`,
  `DELETE FROM public.pass_purchases WHERE user_id = $1::uuid`,
  `DELETE FROM public.payment_sessions WHERE user_id = $1::uuid`,
  `DELETE FROM public.search_history WHERE user_id = $1::uuid`,
  `DELETE FROM public.notifications WHERE user_id = $1::uuid`,
  `DELETE FROM public.feedback WHERE user_id = $1::uuid`,
  `DELETE FROM public.error_logs WHERE user_id = $1::uuid`,
  `DELETE FROM public.referrals WHERE referrer_id = $1::uuid OR referred_user_id = $1::uuid`,
  `DELETE FROM public.social_activity WHERE user_id = $1::uuid`,
  `DELETE FROM public.ticket_responses
     WHERE responder_id = $1::uuid
        OR ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = $1::uuid)`,
  `DELETE FROM public.support_tickets WHERE user_id = $1::uuid`,
];

const CORE_DELETES = [
  `DELETE FROM public.review_responses WHERE user_id = $1::uuid`,
  `DELETE FROM public.reviews WHERE user_id = $1::uuid`,
  ...OPTIONAL_DELETES,
  `DELETE FROM public.redemptions WHERE user_id = $1::uuid`,
  `DELETE FROM public.passes WHERE user_id = $1::uuid`,
  `DELETE FROM public.business_photos WHERE uploaded_by = $1::uuid`,
  `DELETE FROM public.pending_edits WHERE owner_id = $1::uuid`,
  `DELETE FROM public.pending_businesses WHERE owner_id = $1::uuid`,
  `DELETE FROM public.businesses WHERE owner_id = $1::uuid`,
  `DELETE FROM public.user_profiles WHERE user_id = $1::uuid`,
  `DELETE FROM storage.objects WHERE owner = $1::uuid`,
];

function ignorableError(code) {
  return code === '42P01' || code === '42703'; // undefined_table / undefined_column
}

async function runOptional(client, sql, uuid) {
  try {
    const r = await client.query(sql, [uuid]);
    return r.rowCount ?? 0;
  } catch (e) {
    if (ignorableError(e.code)) return 0;
    throw e;
  }
}

async function purgeManual(client, uuid) {
  for (const sql of CORE_DELETES) {
    await runOptional(client, sql, uuid);
  }
}

async function main() {
  const uid = (process.argv[2] || '').trim();
  if (!uid || uid === '-h' || uid === '--help') {
    printHelp();
    process.exit(uid ? 0 : 1);
  }
  if (!UUID_RE.test(uid)) {
    console.error('Invalid UUID. Example: 9be7fcd6-96d8-4c9a-bfd8-c7fd316933bd');
    process.exit(1);
  }

  const databaseUrl = loadDatabaseUrl();
  if (!databaseUrl) {
    console.error('Missing DATABASE_URL. Create .env.db.local — see: npm run db:purge-user -- --help\n');
    printHelp();
    process.exit(1);
  }

  const useSsl = !/localhost|127\.0\.0\.1/.test(databaseUrl);
  const client = new Client({
    connectionString: databaseUrl,
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    let usedRpc = false;
    try {
      await client.query('SELECT public.delete_public_app_data_for_user($1::uuid)', [uid]);
      usedRpc = true;
      console.log('Used database function delete_public_app_data_for_user (migrations applied).');
    } catch (e) {
      if (e.code === '42883' || /does not exist/i.test(String(e.message))) {
        console.log('RPC not found — running inline purge (same steps as migration).');
        await purgeManual(client, uid);
      } else {
        throw e;
      }
    }

    const delAuth = await client.query('DELETE FROM auth.users WHERE id = $1::uuid RETURNING id', [
      uid,
    ]);
    if (delAuth.rowCount === 0) {
      console.warn('No row deleted in auth.users (user id may already be gone).');
    } else {
      console.log('Deleted auth user:', uid);
    }

    await client.query('COMMIT');
    console.log(usedRpc ? 'Done (RPC + auth delete).' : 'Done (inline purge + auth delete).');
    console.log('You can sign up that email again.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('\nFailed:', err.message || err);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    console.error('\nIf a table name appears above, tell your developer or run the SQL from supabase/scripts/diagnose_auth_user_delete_blockers.sql');
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
