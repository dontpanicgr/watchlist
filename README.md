# Queue

A simple movie queue: search TMDB, add films to watch, then mark them watched.

## Setup

1. Create a free TMDB API key: https://www.themoviedb.org/settings/api
2. Copy `.env.example` to `.env` and set your keys:

```bash
cp .env.example .env
```

```
VITE_TMDB_API_KEY=your_tmdb_key
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

Supabase vars are optional. Without them the app still runs; personal data stays in `localStorage` only and the Watchlist header shows a short setup hint.

3. Install and run:

```bash
npm install
npm run dev
```

### Cloud sync (Supabase)

Personal data (queue, user-added films, notes, UI prefs) syncs across browsers when you sign in. The curated catalog can also live in Supabase (`catalog_films`) so every client loads the same library; bundled `films.json` remains the offline fallback.

1. Create a free [Supabase](https://supabase.com) project.
2. In the SQL editor, run [`supabase/schema.sql`](supabase/schema.sql) (personal tables + shared `catalog_films` + RLS). Or run [`supabase/catalog_films.sql`](supabase/catalog_films.sql) alone if you already applied an older schema.
3. **Authentication → Providers**: enable Email. Magic link (OTP) is enough.
4. **Authentication → URL Configuration**: set Site URL to `http://localhost:5173` and add `http://localhost:5173` under Redirect URLs (add your production origin when you deploy).
5. Copy Project URL and `anon` public key into `.env` as `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
6. Seed the shared catalog (once, or after regenerating `films.json`):

```bash
# Project Settings → API → service_role — put in .env (never VITE_*):
# SUPABASE_SERVICE_ROLE_KEY=eyJ...
npm run upload:catalog
```

7. Restart `npm run dev`, then use **Sign in** in the Watchlist header (email magic link).

**Conflict policy:** on sign-in, if the cloud already has data it replaces local state; if the cloud is empty, local data is uploaded (first sync). After that, local edits upsert/delete to Supabase (notes are debounced). `localStorage` remains an offline cache.

**Catalog load:** on startup the app fetches `catalog_films` (read-only). If the table is non-empty, that list is primary; otherwise it uses bundled `src/data/films.json`. User-added films still merge on top. The app never upserts the full catalog on page load — only `npm run upload:catalog` writes it (service role).

**Env vars**

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_TMDB_API_KEY` | For search / film DB rebuild | TMDB API |
| `VITE_SUPABASE_URL` | For cloud sync / catalog fetch | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | For cloud sync / catalog fetch | Supabase anon (public) key |
| `SUPABASE_SERVICE_ROLE_KEY` | For `npm run upload:catalog` only | Service role key (server-side seed; never expose to Vite) |

## Local film database

The app ships with a curated film list extracted from Pop Arts “Decade in Review” YouTube videos (top 100 per decade), enriched via TMDB. Keep regenerating and committing `films.json` locally; optionally mirror it to Supabase with `npm run upload:catalog`.

| File | Purpose |
| --- | --- |
| `data/films.json` | Canonical dataset |
| `src/data/films.json` | Same data, importable from the Vite app (fallback) |
| `src/data/films.types.ts` | TypeScript types for the dataset |
| `data/films.raw.json` | Extracted titles before / alongside TMDB enrichment |
| `supabase/catalog_films.sql` | Shared catalog table + public-read RLS |
| `scripts/upload-catalog-to-supabase.mjs` | Idempotent upsert of `data/films.json` → `catalog_films` |

Each film stores: `id`, `tmdbId`, `imdbId`, `title`, `year`, `director`, `coverUrl`, `sourceVideoIds`.

### Open in Stremio

Catalog and queue rows can open the Stremio desktop app via deep link:

```
stremio:///detail/movie/{imdbId}/{imdbId}
```

Example: `stremio:///detail/movie/tt0111161/tt0111161` (IMDb id required; Cinemeta’s movie id matches the IMDb id). When a film only has a TMDB id (live search / older queue items), the app fetches `/movie/{id}/external_ids` on click before opening.

### Regenerate

1. Ensure `VITE_TMDB_API_KEY` is set in `.env` (see `.env.example`).
2. Optional: install [yt-dlp](https://github.com/yt-dlp/yt-dlp) (or place `yt-dlp.exe` in `tools/`) if you need to re-fetch descriptions.
3. Run:

```bash
npm run build:films          # reuse cached descriptions in data/raw/
npm run build:films:refresh # re-download YouTube descriptions via yt-dlp
npm run build:films:imdb    # add/refresh imdbId via TMDB external_ids only
```

Without a TMDB key, the script still writes extracted titles as unmatched stubs (`tmdbId: null`) and `data/films.raw.json`.
