import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
} from 'react'
import { createPortal } from 'react-dom'
import type { AuthStatus } from '../useAuth'
import type { SyncStatus } from '../useCloudSync'

type AccountControlProps = {
  configured: boolean
  authStatus: AuthStatus
  email: string | null
  authBusy: boolean
  authMessage: string | null
  onSignIn: (email: string) => void | Promise<void>
  onSignOut: () => void | Promise<void>
  onClearMessage?: () => void
}

type SyncIndicatorProps = {
  configured: boolean
  authStatus: AuthStatus
  syncStatus: SyncStatus
  syncError: string | null
}

function SignInIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M5 19.5c1.2-3.2 3.5-5 7-5s5.8 1.8 7 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function syncLabel(status: SyncStatus): string | null {
  switch (status) {
    case 'pulling':
      return 'Loading…'
    case 'syncing':
      return 'Syncing…'
    case 'synced':
      return 'Synced'
    case 'error':
      return 'Sync error'
    default:
      return null
  }
}

/** Quiet sync status for the Watchlist header — auth lives in the left nav. */
export function SyncIndicator({
  configured,
  authStatus,
  syncStatus,
  syncError,
}: SyncIndicatorProps) {
  if (!configured || authStatus === 'signed-out' || authStatus === 'disabled') {
    return null
  }

  if (authStatus === 'loading') {
    return <span className="account-sync">…</span>
  }

  const label = syncLabel(syncStatus)
  if (!label) return null

  return (
    <span
      className="account-sync"
      data-tone={syncStatus === 'error' ? 'error' : undefined}
      title={syncError ?? undefined}
    >
      {label}
    </span>
  )
}

export function AccountControl({
  configured,
  authStatus,
  email,
  authBusy,
  authMessage,
  onSignIn,
  onSignOut,
  onClearMessage,
}: AccountControlProps) {
  const emailId = useId()
  const titleId = useId()
  const menuId = useId()
  const [emailInput, setEmailInput] = useState('')
  const [signInOpen, setSignInOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState<CSSProperties | undefined>()
  const emailInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const avatarBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (authStatus === 'signed-in') setSignInOpen(false)
  }, [authStatus])

  useEffect(() => {
    if (!signInOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setSignInOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    const frame = requestAnimationFrame(() => {
      emailInputRef.current?.focus()
    })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      cancelAnimationFrame(frame)
    }
  }, [signInOpen])

  useLayoutEffect(() => {
    if (!menuOpen || !avatarBtnRef.current) return

    const place = () => {
      const rect = avatarBtnRef.current?.getBoundingClientRect()
      if (!rect) return
      setMenuStyle({
        position: 'fixed',
        left: Math.round(rect.right + 8),
        bottom: Math.round(window.innerHeight - rect.bottom),
        top: 'auto',
      })
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMenuOpen(false)
        avatarBtnRef.current?.focus()
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (avatarBtnRef.current?.contains(target)) return
      setMenuOpen(false)
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [menuOpen])

  if (!configured) return null

  function openSignIn() {
    onClearMessage?.()
    setEmailInput('')
    setSignInOpen(true)
  }

  function closeSignIn() {
    setSignInOpen(false)
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    void onSignIn(emailInput)
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) {
      closeSignIn()
    }
  }

  if (authStatus === 'loading') {
    return (
      <button
        type="button"
        className="app-nav-btn"
        aria-label="Account"
        title="Account"
        disabled
      >
        <SignInIcon />
      </button>
    )
  }

  if (authStatus === 'signed-in') {
    return (
      <div className="app-nav-account">
        <button
          ref={avatarBtnRef}
          type="button"
          className="app-nav-btn app-nav-avatar"
          aria-label="Account"
          title={email ?? 'Account'}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span className="app-nav-avatar-face" aria-hidden="true">
            🎬
          </span>
        </button>
        {menuOpen
          ? createPortal(
              <div
                ref={menuRef}
                id={menuId}
                className="account-menu"
                role="menu"
                aria-label="Account"
                style={menuStyle}
              >
                {email ? (
                  <p className="account-menu-email" title={email}>
                    {email}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="account-menu-item"
                  role="menuitem"
                  disabled={authBusy}
                  onClick={() => {
                    setMenuOpen(false)
                    void onSignOut()
                  }}
                >
                  Sign out
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        className="app-nav-btn"
        aria-label="Sign in"
        title="Sign in"
        onClick={openSignIn}
      >
        <SignInIcon />
      </button>
      {signInOpen
        ? createPortal(
            <div
              className="account-dialog-backdrop"
              role="presentation"
              onClick={handleBackdropClick}
            >
              <div
                className="account-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <button
                  type="button"
                  className="icon-btn account-dialog-close"
                  aria-label="Close"
                  onClick={closeSignIn}
                >
                  <CloseIcon />
                </button>
                <h2 id={titleId} className="account-dialog-title">
                  Sign in
                </h2>
                <p className="account-dialog-hint">
                  We&apos;ll email you a magic link — works across browsers.
                </p>
                <form className="account-dialog-form" onSubmit={handleSubmit}>
                  <label className="visually-hidden" htmlFor={emailId}>
                    Email for magic link
                  </label>
                  <input
                    ref={emailInputRef}
                    id={emailId}
                    className="account-dialog-input"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="Email"
                    value={emailInput}
                    disabled={authBusy}
                    onChange={(event) => setEmailInput(event.target.value)}
                  />
                  <button type="submit" className="account-dialog-submit" disabled={authBusy}>
                    {authBusy ? 'Sending…' : 'Send magic link'}
                  </button>
                </form>
                {authMessage ? (
                  <p className="account-dialog-message" role="status">
                    {authMessage}
                  </p>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
