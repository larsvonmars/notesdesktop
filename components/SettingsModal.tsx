'use client'

import { useEffect, useMemo, useState } from 'react'
import { useIsMobile } from '@/lib/useIsMobile'
import { useAuth } from '@/lib/auth-context'
import { supabase } from '@/lib/supabase'
import ThemeSelector from './ThemeSelector'
import BaseModal, { ModalHeader, ModalBody, ModalTitle } from './BaseModal'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const deleteAccountApiRoute = '/api/account/delete'
const configuredDeleteAccountEndpoint = process.env.NEXT_PUBLIC_DELETE_ACCOUNT_ENDPOINT?.trim()
const supabaseEdgeDeleteAccountEndpoint = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')}/functions/v1/delete-account`
  : null

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
  }, [displayNameFromProfile, isOpen, userEmail])

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
      size={isMobile ? 'full' : 'lg'}
      maxHeight={isMobile ? '92vh' : '82vh'}
      zIndex={70}
    >
        <ModalHeader onClose={onClose} closeAriaLabel="Close settings">
          <ModalTitle>Settings</ModalTitle>
        </ModalHeader>

        <ModalBody className="space-y-8">
          {/* ─── Account ─── */}
          <section className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Account</h3>

            <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-800/60 p-3 sm:p-4 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Current Email</span>
                <span className="text-sm font-medium text-gray-900 dark:text-slate-100 break-all text-right">{userEmail || 'Not available'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wide">Account ID</span>
                <span className="text-[11px] font-mono text-gray-700 dark:text-slate-300 break-all text-right">{user?.id || 'Not available'}</span>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-display-name" className="text-sm font-medium text-gray-700 dark:text-slate-200">Display Name</label>
              <div className="flex gap-2">
                <input
                  id="settings-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="How your name appears"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleSaveProfile}
                  disabled={isSavingProfile || !user}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isSavingProfile ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-email" className="text-sm font-medium text-gray-700 dark:text-slate-200">Email Address</label>
              <div className="flex gap-2">
                <input
                  id="settings-email"
                  type="email"
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  placeholder="name@example.com"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleUpdateEmail}
                  disabled={isUpdatingEmail || !user}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isUpdatingEmail ? 'Updating...' : 'Update'}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">Email updates require confirmation through your inbox.</p>
            </div>

            <div className="space-y-2">
              <label htmlFor="settings-password" className="text-sm font-medium text-gray-700 dark:text-slate-200">New Password</label>
              <input
                id="settings-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <label htmlFor="settings-password-confirm" className="text-sm font-medium text-gray-700 dark:text-slate-200">Confirm Password</label>
              <div className="flex gap-2">
                <input
                  id="settings-password-confirm"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={handleUpdatePassword}
                  disabled={isUpdatingPassword || !user}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isUpdatingPassword ? 'Updating...' : 'Set'}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-slate-400">You can also request a reset link if you prefer changing it by email.</p>
            </div>

            {(errorMessage || successMessage) && (
              <div
                className={`rounded-lg border px-3 py-2 text-sm ${
                  errorMessage
                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                }`}
              >
                {errorMessage || successMessage}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={handleSendPasswordReset}
                disabled={isSendingReset || !userEmail}
                className="w-full py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-slate-100 bg-white dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSendingReset ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button
                onClick={handleSignOut}
                disabled={isSigningOut || !user}
                className="w-full py-2 text-sm font-medium rounded-lg border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSigningOut ? 'Signing Out...' : 'Sign Out'}
              </button>
            </div>

            <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/20 p-3 sm:p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-red-700 dark:text-red-300">Delete Account</p>
                <p className="text-xs text-red-700/90 dark:text-red-300/90 mt-1">
                  This permanently removes your account and cannot be undone.
                </p>
              </div>
              <label htmlFor="settings-delete-confirm" className="text-xs font-medium text-red-700 dark:text-red-300 uppercase tracking-wide">
                Type DELETE to confirm
              </label>
              <div className="flex gap-2">
                <input
                  id="settings-delete-confirm"
                  type="text"
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  placeholder="DELETE"
                  className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 text-gray-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                />
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount || !user || deleteConfirmationText !== 'DELETE'}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {isDeletingAccount ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </section>

          {/* ─── Appearance ─── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-3">Appearance</h3>
            <ThemeSelector />
          </section>
        </ModalBody>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3.5 sm:py-4 border-t border-gray-100 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/60">
          <button
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-gray-700 dark:text-slate-100 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 rounded-lg transition-colors"
          >
            Done
          </button>
        </div>
    </BaseModal>
  )
}
