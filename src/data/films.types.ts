/** Shape of the local film database (`data/films.json` / `src/data/films.json`). */

export type FilmSource = {
  videoId: string
  url: string
  title?: string | null
}

export type Film = {
  /** `tmdb-<id>` when matched, or `unmatched-<slug>` when not. */
  id: string
  tmdbId: number | null
  /** IMDb id (`tt…`) from TMDB external_ids, when known. */
  imdbId: string | null
  title: string
  year: number | null
  director: string | null
  /** TMDB poster at w500, or null. */
  coverUrl: string | null
  /** YouTube video ids whose descriptions listed this film. */
  sourceVideoIds: string[]
}

export type FilmsDatabase = {
  generatedAt: string
  sources: FilmSource[]
  films: Film[]
}
