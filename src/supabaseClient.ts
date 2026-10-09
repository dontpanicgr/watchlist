import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(
  url?.trim() && anonKey?.trim() && !url.includes('your-') && !anonKey.includes('your-'),
)

/** Null when env vars are missing — app still runs with localStorage only. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url!.trim(), anonKey!.trim())
  : null

export const AUTH_REDIRECT_URL =
  typeof window !== 'undefined' ? `${window.location.origin}/` : 'http://localhost:5173/'
