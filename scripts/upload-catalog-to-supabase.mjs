#!/usr/bin/env node
/**
 * Upsert local data/films.json into Supabase public.catalog_films.
 *
 * Usage:
 *   npm run upload:catalog
 *
 * Env (.env):
 *   VITE_SUPABASE_URL              — project URL
 *   SUPABASE_SERVICE_ROLE_KEY      — preferred (bypasses RLS; never commit / never VITE_*)
 *   VITE_SUPABASE_ANON_KEY         — fallback only; upsert fails unless RLS allows writes
 *
 * Prerequisites: run supabase/schema.sql or supabase/catalog_films.sql in the SQL editor.
 */

import { createClient } from '@supabase/supabase-js'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const FILMS_PATH = join(ROOT, 'data', 'films.json')
const BATCH_SIZE = 100

function loadEnv() {
  const envPath = join(ROOT, '.env')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = value
  }
}

function filmToRow(film, generatedAt) {
  return {
    id: film.id,
    tmdb_id: film.tmdbId ?? null,
    imdb_id: film.imdbId ?? null,
    title: film.title,
    year: film.year ?? null,
    director: film.director ?? null,
    cover_url: film.coverUrl ?? null,
    source_video_ids: Array.isArray(film.sourceVideoIds) ? film.sourceVideoIds : [],
    generated_at: generatedAt ?? null,
    updated_at: new Date().toISOString(),
  }
}

async function main() {
  loadEnv()

  const url = process.env.VITE_SUPABASE_URL?.trim()
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY?.trim()
  const key = serviceKey || anonKey

  if (!url || !key) {
    console.error(
      'Missing VITE_SUPABASE_URL and a write key.\n' +
        'Add SUPABASE_SERVICE_ROLE_KEY to .env (Project Settings → API → service_role).\n' +
        'Do not put the service role key in VITE_* vars or client code.',
    )
    process.exit(1)
  }

  if (!serviceKey) {
    console.warn(
      '⚠️  SUPABASE_SERVICE_ROLE_KEY not set — using anon key.\n' +
        '   Upsert will fail under default RLS (public read only).\n' +
        '   Add the service_role key to .env and re-run.\n',
    )
  } else {
    console.log('Using service role key (RLS bypassed for seed).')
  }

  if (!existsSync(FILMS_PATH)) {
    console.error(`Missing ${FILMS_PATH}`)
    process.exit(1)
  }

  const db = JSON.parse(readFileSync(FILMS_PATH, 'utf8'))
  const films = Array.isArray(db.films) ? db.films : []
  if (films.length === 0) {
    console.error('data/films.json has no films')
    process.exit(1)
  }

  const generatedAt = typeof db.generatedAt === 'string' ? db.generatedAt : null
  const rows = films.map((film) => filmToRow(film, generatedAt))
  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  console.log(`Upserting ${rows.length} films into catalog_films…`)

  let upserted = 0
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { error } = await client.from('catalog_films').upsert(batch, {
      onConflict: 'id',
    })
    if (error) {
      console.error(`Batch starting at ${i} failed:`, error.message)
      if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
        console.error(
          '\nTable missing. Run supabase/catalog_films.sql (or schema.sql) in the SQL editor first.',
        )
      } else if (!serviceKey) {
        console.error(
          '\nLikely RLS blocked the write. Add SUPABASE_SERVICE_ROLE_KEY to .env\n' +
            '(never expose it to Vite / the browser) and re-run: npm run upload:catalog',
        )
      }
      process.exit(1)
    }
    upserted += batch.length
    process.stdout.write(`  ${upserted}/${rows.length}\r`)
  }

  console.log(`\nDone. Upserted ${upserted} rows (idempotent on id).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
