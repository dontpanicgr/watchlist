/**
 * Stremio movie deep links (Cinemeta / official addon SDK):
 *   stremio:///detail/movie/{imdbId}/{imdbId}
 * e.g. stremio:///detail/movie/tt0111161/tt0111161
 *
 * IMDb ids are required — Stremio’s default catalog resolves movies by `tt…`,
 * not TMDB. Use TMDB `/movie/{id}/external_ids` when only a TMDB id is known.
 *
 * Web fallback (not used here): https://web.stremio.com/#/detail/movie/{imdbId}/{imdbId}
 */

export function normalizeImdbId(imdbId: string | null | undefined): string | null {
  if (!imdbId || typeof imdbId !== 'string') return null
  const trimmed = imdbId.trim()
  if (!/^tt\d+$/i.test(trimmed)) return null
  return trimmed.toLowerCase()
}

export function getStremioMovieUrl({
  imdbId,
  tmdbId: _tmdbId,
}: {
  imdbId?: string | null
  /** Accepted for callers that only have TMDB; does not form a URL by itself. */
  tmdbId?: number | null
}): string | null {
  const id = normalizeImdbId(imdbId)
  if (!id) return null
  return `stremio:///detail/movie/${id}/${id}`
}
