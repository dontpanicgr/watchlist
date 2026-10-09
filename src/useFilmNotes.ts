import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'queue.filmNotes'
const LEGACY_STORAGE_KEY = 'queue.filmComments'

export type FilmNotesMap = Record<string, string>

function trimNote(text: string): string {
  return text.trim()
}

/** Collapse legacy comment arrays / shapes into one note string. */
function commentsToNote(value: unknown): string {
  if (typeof value === 'string') return trimNote(value)

  if (Array.isArray(value)) {
    const parts: string[] = []
    for (const entry of value) {
      if (typeof entry === 'string') {
        const text = trimNote(entry)
        if (text) parts.push(text)
        continue
      }
      if (entry && typeof entry === 'object' && 'text' in entry) {
        const text = trimNote(String((entry as { text?: unknown }).text ?? ''))
        if (text) parts.push(text)
      }
    }
    return parts.join('\n\n')
  }

  if (value && typeof value === 'object' && 'text' in value) {
    return trimNote(String((value as { text?: unknown }).text ?? ''))
  }

  return ''
}

function normalizeNote(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object' && 'text' in value) {
    return String((value as { text?: unknown }).text ?? '')
  }
  return commentsToNote(value)
}

function migrateLegacyComments(): FilmNotesMap {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}

    const next: FilmNotesMap = {}
    for (const [filmId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const note = commentsToNote(value)
      if (note) next[filmId] = note
    }
    return next
  } catch {
    return {}
  }
}

function loadNotes(): FilmNotesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const next: FilmNotesMap = {}
        for (const [filmId, value] of Object.entries(parsed as Record<string, unknown>)) {
          const note = normalizeNote(value)
          if (note.trim()) next[filmId] = note
        }
        return next
      }
    }
  } catch {
    /* fall through to legacy */
  }

  const migrated = migrateLegacyComments()
  if (Object.keys(migrated).length > 0) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
      localStorage.removeItem(LEGACY_STORAGE_KEY)
    } catch {
      /* ignore quota / private mode */
    }
  }
  return migrated
}

export function useFilmNotes() {
  const [notes, setNotes] = useState<FilmNotesMap>(() => loadNotes())

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }, [notes])

  const getNote = useCallback((filmId: string): string => notes[filmId] ?? '', [notes])

  const setNote = useCallback((filmId: string, text: string) => {
    setNotes((current) => {
      const nextText = text
      const existing = current[filmId] ?? ''
      if (existing === nextText) return current

      if (!trimNote(nextText)) {
        if (!(filmId in current)) return current
        const next = { ...current }
        delete next[filmId]
        return next
      }

      return { ...current, [filmId]: nextText }
    })
  }, [])

  const replaceNotes = useCallback((next: FilmNotesMap) => {
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      setNotes({})
      return
    }
    const cleaned: FilmNotesMap = {}
    for (const [filmId, text] of Object.entries(next)) {
      if (typeof text === 'string' && trimNote(text)) cleaned[filmId] = text
    }
    setNotes(cleaned)
  }, [])

  return {
    notes,
    getNote,
    setNote,
    replaceNotes,
  }
}
