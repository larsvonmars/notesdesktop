'use client'

import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import {
  readGrammarEnabledPreference,
  setGrammarEnabledPreference,
} from '@/lib/editor/grammar/preferences'
import {
  readWelcomeOnStartupPreference,
  setWelcomeOnStartupPreference,
} from '@/lib/workspace/preferences'
import { Palette, PenLine, Rocket, Settings2, User, type LucideProps } from 'lucide-react'
import ThemeSelector from './ThemeSelector'
import BaseModal, { ModalHeader, ModalTitle } from './BaseModal'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const deleteAccountApiRoute = '/api/account/delete'
const configuredDeleteAccountEndpoint = process.env.NEXT_PUBLIC_DELETE_ACCOUNT_ENDPOINT?.trim()
const supabaseEdgeDeleteAccountEndpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/delete-account`
  : null

const SETTINGS_SECTIONS: ReadonlyArray<{
  id: 'account' | 'appearance' | 'editor' | 'startup'
  label: string
  icon: ComponentType<LucideProps>
}> = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'editor', label: 'Editor', icon: PenLine },
  { id: 'startup', label: 'Startup', icon: Rocket },
]

type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]['id']

const metaLabelClass = 'text-[11px] font-medium uppercase tracking-[0.08em] text-muted'

const fieldClass =
  'glass-input h-11 w-full rounded-xl px-3.5 text-sm text-foreground placeholder:text-muted'

const primaryActionClass =
  'glass-btn-primary inline-flex h-11 shrink-0 items-center justify-center rounded-full px-4 text-[13px] text-accent-foreground transition-[filter] duration-200 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50'

const wideActionClass =
  'glass-btn inline-flex h-11 w-full items-center justify-center rounded-full px-4 text-[13px] font-medium text-foreground transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50'

const dangerWideActionClass =
  'inline-flex h-11 w-full items-center justify-center rounded-full border border-[var(--border)] px-4 text-[13px] font-medium text-danger transition-colors duration-150 hover:bg-[var(--danger-light)] disabled:cursor-not-allowed disabled:opacity-50'

function SectionHeading({
  icon: Icon,
  title,
  description,
}: {
  icon: ComponentType<LucideProps>
  title: string
  description?: string
}) {
  return (
    <div className="mb-3 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-muted">
        <Icon size={14} strokeWidth={1.9} aria-hidden />
      </span>
      <div className="min-w-0">
        <h3 className="text-[13px] font-semibold leading-5 text-foreground">{title}</h3>
        {description && <p className="mt-0.5 text-xs leading-5 text-muted">{description}</p>}
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  title,
  description,
  checked,
  onClick,
}: {
  label: string
  title: string
  description: string
  checked: boolean
  onClick: () => void
}) {
  return (
    <div className="glass flex items-start justify-between gap-4 rounded-2xl p-4">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onClick}
        className={`focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ${
          checked
            ? 'border-transparent bg-accent'
            : 'border-[var(--border-strong)] bg-[var(--surface-sunken)]'
        }`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] transform rounded-full bg-[var(--accent-contrast)] shadow-sm transition-transform duration-200 ${
            checked ? 'translate-x-[22px]' : 'translate-x-[3px]'
          }`}
        />
      </button>
    </div>
  )
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const isMobile = useIsMobile()
  const { user, session, signOut } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [emailDraft, setEmailDraft] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isUpdatingEmail, setIsUpdatingEmail] = useState(false)
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [grammarCheckEnabled, setGrammarCheckEnabled] = useState(() => readGrammarEnabledPreference())
  const [welcomeOnStartup, setWelcomeOnStartup] = useState(() => readWelcomeOnStartupPreference())
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('account')
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const userEmail = user?.email ?? ''
  const displayNameFromProfile = useMemo(
    () => (typeof user?.user_metadata?.display_name === 'string' ? user.user_metadata.display_name : ''),
    [user?.user_metadata?.display_name]
  )

  useEffect(() => {
    if (!isOpen) return
    setDisplayName(displayNameFromProfile)
    setEmailDraft(userEmail)
    setNewPassword('')
    setConfirmPassword('')
    setDeleteConfirmationText('')
    setErrorMessage(null)
    setSuccessMessage(null)
    setGrammarCheckEnabled(readGrammarEnabledPreference())
    setWelcomeOnStartup(readWelcomeOnStartupPreference())
  }, [displayNameFromProfile, isOpen, userEmail])

  const handleToggleGrammarCheck = () => {
    const next = !grammarCheckEnabled
    setGrammarCheckEnabled(next)
    // Persists and notifies the editor, which may be open behind this modal.
    setGrammarEnabledPreference(next)
  }

  const handleToggleWelcomeOnStartup = () => {
    const next = !welcomeOnStartup
    setWelcomeOnStartup(next)
    setWelcomeOnStartupPreference(next)
  }

  const clearMessages = () => {
    setErrorMessage(null)
    setSuccessMessage(null)
  }

  const setError = (message: string) => {
    setSuccessMessage(null)
    setErrorMessage(message)
  }

  const setSuccess = (message: string) => {
    setErrorMessage(null)
    setSuccessMessage(message)
  }

  const jumpToSection = (id: SettingsSectionId) => {
    setActiveSection(id)
    const container = scrollRef.current
    if (!container) return
    const target = container.querySelector<HTMLElement>(`[data-settings-section="${id}"]`)
    if (!target) return
    const top =
      target.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      8
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    container.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' })
  }

  const handleBodyScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const container = event.currentTarget
    // The last section may never reach the top of the viewport, so pin the
    // highlight to it once the panel is scrolled to the end.
    const atBottom =
      container.scrollTop + container.clientHeight >= container.scrollHeight - 4
    if (atBottom) {
      const last = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id
      setActiveSection((current) => (current === last ? current : last))
      return
    }
    const containerTop = container.getBoundingClientRect().top
    let next: SettingsSectionId = SETTINGS_SECTIONS[0].id
    for (const section of SETTINGS_SECTIONS) {
      const target = container.querySelector<HTMLElement>(`[data-settings-section="${section.id}"]`)
      if (target && target.getBoundingClientRect().top - containerTop <= 64) {
        next = section.id
      }
    }
    setActiveSection((current) => (current === next ? current : next))
  }

  const handleSaveProfile = async () => {
    clearMessages()

    if (!user) {
      setError('You need to be signed in to update your profile.')
      return
    }

    setIsSavingProfile(true)
    try {
      const normalizedDisplayName = displayName.trim()
      const { error } = await supabase.auth.updateUser({
        data: {
          display_name: normalizedDisplayName || null,
        },
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess('Profile updated successfully.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleUpdateEmail = async () => {
    clearMessages()

    if (!user) {
      setError('You need to be signed in to update your email address.')
      return
    }

    const normalizedEmail = emailDraft.trim().toLowerCase()
    if (!normalizedEmail) {
      setError('Enter a valid email address.')
      return
    }
    if (normalizedEmail === userEmail.toLowerCase()) {
      setError('Enter a different email address to update.')
      return
    }

    setIsUpdatingEmail(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: normalizedEmail })
      if (error) {
        setError(error.message)
        return
      }

      setSuccess('Email update requested. Check your inbox to confirm the new address.')
    } finally {
      setIsUpdatingEmail(false)
    }
  }

  const handleUpdatePassword = async () => {
    clearMessages()

    if (!user) {
      setError('You need to be signed in to update your password.')
      return
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsUpdatingPassword(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        setError(error.message)
        return
      }

      setNewPassword('')
      setConfirmPassword('')
      setSuccess('Password updated successfully.')
    } finally {
      setIsUpdatingPassword(false)
    }
  }

  const handleSendPasswordReset = async () => {
    clearMessages()

    if (!userEmail) {
      setError('No email address found for your account.')
      return
    }

    setIsSendingReset(true)
    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined
      const { error } = await supabase.auth.resetPasswordForEmail(userEmail, {
        redirectTo,
      })

      if (error) {
        setError(error.message)
        return
      }

      setSuccess('Password reset link sent. Check your inbox.')
    } finally {
      setIsSendingReset(false)
    }
  }

  const handleSignOut = async () => {
    clearMessages()
    setIsSigningOut(true)
    try {
      await signOut()
      onClose()
    } catch {
      setError('Sign out failed. Please try again.')
    } finally {
      setIsSigningOut(false)
    }
  }

  const handleDeleteAccount = async () => {
    clearMessages()

    if (!user) {
      setError('You need to be signed in to delete your account.')
      return
    }

    const accessToken = session?.access_token
    if (!accessToken) {
      setError('Session expired. Please sign in again before deleting your account.')
      return
    }

    if (deleteConfirmationText !== 'DELETE') {
      setError('Type DELETE exactly to confirm account deletion.')
      return
    }

    setIsDeletingAccount(true)
    try {
      const endpointCandidates = [
        configuredDeleteAccountEndpoint,
        deleteAccountApiRoute,
        supabaseEdgeDeleteAccountEndpoint,
      ].filter((value): value is string => !!value)

      const dedupedCandidates = Array.from(new Set(endpointCandidates))
      let lastErrorMessage = 'Unable to delete account right now.'

      for (const endpoint of dedupedCandidates) {
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
              confirmationText: deleteConfirmationText,
            }),
          })

          const payload = (await response.json().catch(() => ({}))) as { error?: string }

          if (response.ok) {
            setSuccess('Your account has been deleted.')
            setDeleteConfirmationText('')
            await signOut()
            onClose()
            return
          }

          const endpointLooksMissing = response.status === 404 || response.status === 405
          if (endpointLooksMissing) {
            continue
          }

          lastErrorMessage = payload.error || lastErrorMessage
          break
        } catch {
          continue
        }
      }

      if (!configuredDeleteAccountEndpoint && !supabaseEdgeDeleteAccountEndpoint) {
        lastErrorMessage = 'Account deletion endpoint is unavailable. Set NEXT_PUBLIC_DELETE_ACCOUNT_ENDPOINT to a deployed endpoint (for static/Tauri builds).'
      }

      setError(lastErrorMessage)
    } catch {
      setError('Unable to delete account right now.')
    } finally {
      setIsDeletingAccount(false)
    }
  }

  if (!isOpen) return null

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      size={isMobile ? 'full' : '3xl'}
      maxHeight={isMobile ? '92vh' : '82vh'}
      zIndex={70}
    >
        <ModalHeader onClose={onClose} closeAriaLabel="Close settings">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-light)] text-accent">
            <Settings2 size={17} strokeWidth={1.9} />
          </span>
          <div className="min-w-0">
            <ModalTitle>Settings</ModalTitle>
            <p className="mt-0.5 text-xs leading-5 text-muted">
              Account, appearance, editor and startup
            </p>
          </div>
        </ModalHeader>

        <div className="flex min-h-0 flex-1">
          {/* Section rail (desktop) */}
          <nav
            aria-label="Settings sections"
            className="hidden w-[168px] shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface-sunken)] p-3 sm:flex"
          >
            {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => {
              const isActive = activeSection === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => jumpToSection(id)}
                  aria-current={isActive ? 'true' : undefined}
                  className={[
                    'glass-row flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium',
                    'transition-colors duration-150',
                    isActive ? 'is-active text-foreground' : 'text-muted hover:text-foreground',
                  ].join(' ')}
                >
                  <Icon
                    size={15}
                    strokeWidth={1.9}
                    className={isActive ? 'text-accent' : 'text-muted'}
                    aria-hidden
                  />
                  <span className="truncate">{label}</span>
                </button>
              )
            })}
          </nav>

          {/* Scrollable content */}
          <div
            ref={scrollRef}
            onScroll={handleBodyScroll}
            className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6"
          >
            <div className="space-y-8">
              {/* ─── Account ─── */}
              <section data-settings-section="account" className="space-y-4">
                <SectionHeading
                  icon={User}
                  title="Account"
                  description="Your profile, sign-in details and account control."
                />

                <div className="glass rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-4">
                    <span className={metaLabelClass}>Current Email</span>
                    <span className="break-all text-right text-[13px] font-medium text-foreground">
                      {userEmail || 'Not available'}
                    </span>
                  </div>
                  <div className="glass-divider my-2.5" />
                  <div className="flex items-center justify-between gap-4">
                    <span className={metaLabelClass}>Account ID</span>
                    <span className="break-all text-right font-mono text-[11px] text-muted">
                      {user?.id || 'Not available'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="settings-display-name" className={metaLabelClass}>
                    Display Name
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="settings-display-name"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="How your name appears"
                      className={`${fieldClass} min-w-0 flex-1`}
                    />
                    <button
                      onClick={handleSaveProfile}
                      disabled={isSavingProfile || !user}
                      className={primaryActionClass}
                      type="button"
                    >
                      {isSavingProfile ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="settings-email" className={metaLabelClass}>
                    Email Address
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="settings-email"
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="name@example.com"
                      className={`${fieldClass} min-w-0 flex-1`}
                    />
                    <button
                      onClick={handleUpdateEmail}
                      disabled={isUpdatingEmail || !user}
                      className={primaryActionClass}
                      type="button"
                    >
                      {isUpdatingEmail ? 'Updating...' : 'Update'}
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-muted">Email updates require confirmation through your inbox.</p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="settings-password" className={metaLabelClass}>
                    New Password
                  </label>
                  <input
                    id="settings-password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className={fieldClass}
                  />
                  <label htmlFor="settings-password-confirm" className={metaLabelClass}>
                    Confirm Password
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="settings-password-confirm"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className={`${fieldClass} min-w-0 flex-1`}
                    />
                    <button
                      onClick={handleUpdatePassword}
                      disabled={isUpdatingPassword || !user}
                      className={primaryActionClass}
                      type="button"
                    >
                      {isUpdatingPassword ? 'Updating...' : 'Set'}
                    </button>
                  </div>
                  <p className="text-xs leading-5 text-muted">
                    You can also request a reset link if you prefer changing it by email.
                  </p>
                </div>

                {(errorMessage || successMessage) && (
                  <div
                    role={errorMessage ? 'alert' : 'status'}
                    className={`rounded-xl px-3.5 py-2.5 text-[13px] leading-5 ${
                      errorMessage
                        ? 'bg-[var(--danger-light)] text-danger'
                        : 'bg-[var(--success-light)] text-success'
                    }`}
                  >
                    {errorMessage || successMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={handleSendPasswordReset}
                    disabled={isSendingReset || !userEmail}
                    className={wideActionClass}
                    type="button"
                  >
                    {isSendingReset ? 'Sending...' : 'Send Reset Link'}
                  </button>
                  <button
                    onClick={handleSignOut}
                    disabled={isSigningOut || !user}
                    className={dangerWideActionClass}
                    type="button"
                  >
                    {isSigningOut ? 'Signing Out...' : 'Sign Out'}
                  </button>
                </div>

                <div className="rounded-2xl bg-[var(--danger-light)] p-4">
                  <p className="text-[13px] font-semibold text-danger">Delete Account</p>
                  <p className="mt-1 text-xs leading-5 text-danger">
                    This permanently removes your account and cannot be undone.
                  </p>
                  <label
                    htmlFor="settings-delete-confirm"
                    className={`mt-3 block ${metaLabelClass} text-danger`}
                  >
                    Type DELETE to confirm
                  </label>
                  <div className="mt-1.5 flex gap-2">
                    <input
                      id="settings-delete-confirm"
                      type="text"
                      value={deleteConfirmationText}
                      onChange={(e) => setDeleteConfirmationText(e.target.value)}
                      placeholder="DELETE"
                      className={`${fieldClass} min-w-0 flex-1 border-danger`}
                    />
                    <button
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount || !user || deleteConfirmationText !== 'DELETE'}
                      className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-danger px-4 text-[13px] font-semibold text-accent-foreground transition-[filter] duration-200 hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
                      type="button"
                    >
                      {isDeletingAccount ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </section>

              {/* ─── Appearance ─── */}
              <section data-settings-section="appearance">
                <SectionHeading
                  icon={Palette}
                  title="Appearance"
                  description="Choose how MindViz Notes looks on this device."
                />
                <div className="glass rounded-2xl p-4">
                  <ThemeSelector />
                </div>
              </section>

              {/* ─── Editor ─── */}
              <section data-settings-section="editor">
                <SectionHeading
                  icon={PenLine}
                  title="Editor"
                  description="Writing assistance while you type."
                />
                <ToggleRow
                  label="Grammar and spelling check"
                  title="Grammar & spelling check"
                  description="Shows suggestions while you write. Runs entirely on your device (English only)."
                  checked={grammarCheckEnabled}
                  onClick={handleToggleGrammarCheck}
                />
              </section>

              {/* ─── Startup ─── */}
              <section data-settings-section="startup">
                <SectionHeading
                  icon={Rocket}
                  title="Startup"
                  description="What you see when the app launches."
                />
                <ToggleRow
                  label="Open Home on launch"
                  title="Open Home on launch"
                  description="Shows your daily briefing with recent notes, tasks, and quick capture when the app starts. You can always reopen it from Home in the sidebar."
                  checked={welcomeOnStartup}
                  onClick={handleToggleWelcomeOnStartup}
                />
              </section>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--surface-sunken)] px-4 py-3.5 sm:px-6 sm:py-4">
          <button
            onClick={onClose}
            className="glass-btn inline-flex h-10 w-full items-center justify-center rounded-full text-[13px] font-medium text-foreground transition-colors duration-150"
            type="button"
          >
            Done
          </button>
        </div>
    </BaseModal>
  )
}