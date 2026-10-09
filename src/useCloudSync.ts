import { useEffect, useRef, useState } from 'react'
import type { Film } from './data/films.types'
import {
  pullRemoteSnapshot,
  pushNotes,
  pushQueue,
  pushUiPrefs,
  pushUserFilms,
  type UiPrefs,
} from './cloudSync'
import type { QueuedMovie } from './types'
import type { FilmNotesMap } from './useFilmNotes'
import type { AuthStatus } from './useAuth'

export type SyncStatus = 'idle' | 'pulling' | 'synced' | 'syncing' | 'error'

type UseCloudSyncArgs = {
  authStatus: AuthStatus
  userId: string | null
  movies: QueuedMovie[]
  userFilms: Film[]
  notes: FilmNotesMap
  prefs: UiPrefs
  replaceQueue: (next: QueuedMovie[]) => void
  replaceUserFilms: (next: Film[]) => void
  replaceNotes: (next: FilmNotesMap) => void
  applyPrefs: (prefs: UiPrefs) => void
}

function isSnapshotEmpty(snapshot: {
  queue: QueuedMovie[]
  userFilms: Film[]
  notes: FilmNotesMap
}): boolean {
  return (
    snapshot.queue.length === 0 &&
    snapshot.userFilms.length === 0 &&
    Object.keys(snapshot.notes).length === 0
  )
}

/**
 * Conflict policy:
 * - On sign-in, if remote has data → remote replaces local.
 * - If remote is empty → keep local and upload (first sync).
 * - After hydrate, local changes upsert/delete to Supabase (notes debounced).
 * localStorage remains the offline cache via existing hooks.
 */
export function useCloudSync({
  authStatus,
  userId,
  movies,
  userFilms,
  notes,
  prefs,
  replaceQueue,
  replaceUserFilms,
  replaceNotes,
  applyPrefs,
}: UseCloudSyncArgs) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncError, setSyncError] = useState<string | null>(null)

  const readyRef = useRef(false)
  const lastUserRef = useRef<string | null>(null)
  const pullGen = useRef(0)
  const localRef = useRef({ movies, userFilms, notes, prefs })
  localRef.current = { movies, userFilms, notes, prefs }

  // Pull remote → hydrate local when session becomes available
  useEffect(() => {
    if (authStatus !== 'signed-in' || !userId) {
      readyRef.current = false
      lastUserRef.current = null
      if (authStatus === 'signed-out' || authStatus === 'disabled') {
        setSyncStatus('idle')
        setSyncError(null)
      }
      return
    }

    if (lastUserRef.current === userId && readyRef.current) return

    const gen = ++pullGen.current
    lastUserRef.current = userId
    readyRef.current = false
    setSyncStatus('pulling')
    setSyncError(null)

    void (async () => {
      try {
        const snapshot = await pullRemoteSnapshot(userId)
        if (pullGen.current !== gen) return

        if (isSnapshotEmpty(snapshot)) {
          const local = localRef.current
          setSyncStatus('syncing')
          await Promise.all([
            pushQueue(userId, local.movies),
            pushUserFilms(userId, local.userFilms),
            pushNotes(userId, local.notes),
            pushUiPrefs(userId, local.prefs),
          ])
          if (pullGen.current !== gen) return
        } else {
          replaceQueue(snapshot.queue)
          replaceUserFilms(snapshot.userFilms)
          replaceNotes(snapshot.notes)
          if (snapshot.prefs) applyPrefs(snapshot.prefs)
        }

        readyRef.current = true
        setSyncStatus('synced')
      } catch (err) {
        if (pullGen.current !== gen) return
        readyRef.current = false
        setSyncStatus('error')
        setSyncError(err instanceof Error ? err.message : 'Could not load cloud data.')
      }
    })()
  }, [
    authStatus,
    userId,
    replaceQueue,
    replaceUserFilms,
    replaceNotes,
    applyPrefs,
  ])

  // Push queue
  useEffect(() => {
    if (!readyRef.current || !userId || authStatus !== 'signed-in') return

    let cancelled = false
    const handle = window.setTimeout(() => {
      setSyncStatus('syncing')
      void pushQueue(userId, movies)
        .then(() => {
          if (!cancelled) {
            setSyncStatus('synced')
            setSyncError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSyncStatus('error')
            setSyncError(err instanceof Error ? err.message : 'Queue sync failed.')
          }
        })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [movies, userId, authStatus])

  // Push user films
  useEffect(() => {
    if (!readyRef.current || !userId || authStatus !== 'signed-in') return

    let cancelled = false
    const handle = window.setTimeout(() => {
      setSyncStatus('syncing')
      void pushUserFilms(userId, userFilms)
        .then(() => {
          if (!cancelled) {
            setSyncStatus('synced')
            setSyncError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSyncStatus('error')
            setSyncError(err instanceof Error ? err.message : 'Library sync failed.')
          }
        })
    }, 400)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [userFilms, userId, authStatus])

  // Push notes (debounced — typing)
  useEffect(() => {
    if (!readyRef.current || !userId || authStatus !== 'signed-in') return

    let cancelled = false
    const handle = window.setTimeout(() => {
      setSyncStatus('syncing')
      void pushNotes(userId, notes)
        .then(() => {
          if (!cancelled) {
            setSyncStatus('synced')
            setSyncError(null)
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSyncStatus('error')
            setSyncError(err instanceof Error ? err.message : 'Notes sync failed.')
          }
        })
    }, 700)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [notes, userId, authStatus])

  // Push UI prefs
  useEffect(() => {
    if (!readyRef.current || !userId || authStatus !== 'signed-in') return

    let cancelled = false
    const handle = window.setTimeout(() => {
      void pushUiPrefs(userId, prefs)
        .then(() => {
          if (!cancelled) setSyncError(null)
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setSyncStatus('error')
            setSyncError(err instanceof Error ? err.message : 'Prefs sync failed.')
          }
        })
    }, 600)

    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [prefs, userId, authStatus])

  return { syncStatus, syncError }
}
