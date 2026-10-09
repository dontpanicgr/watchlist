import { useEffect, useState } from 'react'
import type { Film } from './data/films.types'
import { fetchCatalogFilms } from './cloudSync'
import { isSupabaseConfigured } from './supabaseClient'

/**
 * Base catalog: bundled films.json first, then Supabase `catalog_films` if non-empty.
 * Local JSON remains the offline / empty-cloud fallback. Never uploads on load.
 */
export function useBaseCatalog(localFilms: Film[]) {
  const [baseFilms, setBaseFilms] = useState<Film[]>(localFilms)

  useEffect(() => {
    if (!isSupabaseConfigured) return

    let cancelled = false

    void fetchCatalogFilms().then((remote) => {
      if (cancelled || !remote || remote.length === 0) return
      setBaseFilms(remote)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return baseFilms
}
