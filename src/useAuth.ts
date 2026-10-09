import { useCallback, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { AUTH_REDIRECT_URL, isSupabaseConfigured, supabase } from './supabaseClient'

export type AuthStatus = 'disabled' | 'loading' | 'signed-out' | 'signed-in'

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    isSupabaseConfigured ? 'loading' : 'disabled',
  )
  const [authMessage, setAuthMessage] = useState<string | null>(null)
  const [authBusy, setAuthBusy] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let cancelled = false

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setStatus(data.session ? 'signed-in' : 'signed-out')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setStatus(next ? 'signed-in' : 'signed-out')
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  const signInWithEmail = useCallback(async (email: string) => {
    if (!supabase) {
      setAuthMessage('Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env')
      return
    }

    const trimmed = email.trim()
    if (!trimmed || !trimmed.includes('@')) {
      setAuthMessage('Enter a valid email address.')
      return
    }

    setAuthBusy(true)
    setAuthMessage(null)
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: AUTH_REDIRECT_URL,
          shouldCreateUser: true,
        },
      })
      if (error) throw error
      setAuthMessage('Check your email for the magic link.')
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : 'Could not send magic link.')
    } finally {
      setAuthBusy(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    setAuthBusy(true)
    setAuthMessage(null)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) throw error
    } catch (err) {
      setAuthMessage(err instanceof Error ? err.message : 'Could not sign out.')
    } finally {
      setAuthBusy(false)
    }
  }, [])

  const user: User | null = session?.user ?? null

  return {
    configured: isSupabaseConfigured,
    status,
    user,
    session,
    authMessage,
    authBusy,
    signInWithEmail,
    signOut,
    clearAuthMessage: () => setAuthMessage(null),
  }
}
