'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isResetFlow, setIsResetFlow] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Check if we have a recovery token in the URL hash
    const hash = window.location.hash
    const isResetFlowFromUrl = hash && hash.includes('type=recovery')

    if (isResetFlowFromUrl) {
      setIsResetFlow(true)
      console.log('[UpdatePassword] Found recovery token in URL hash:', hash)

      // Set up a listener for auth state changes
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[UpdatePassword] Auth state changed:', event, session ? 'Session exists' : 'No session')
        if (event === 'PASSWORD_RECOVERY' && session) {
          console.log('[UpdatePassword] Auth state changed to PASSWORD_RECOVERY')
          // We have a valid session from the recovery token
        } else if (event === 'SIGNED_IN' && session) {
          console.log('[UpdatePassword] User signed in via recovery token')
        }
      })

      // Clean up the subscription
      return () => {
        subscription.unsubscribe()
      }
    } else {
      console.log('[UpdatePassword] No recovery token found in URL')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      setLoading(false)
      return
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' })
      setLoading(false)
      return
    }

    try {
      console.log('[UpdatePassword] Attempting to update password...')
      console.log('[UpdatePassword] Is reset flow:', isResetFlow)

      if (isResetFlow) {
        // For password reset flow, we need to get the current user first
        const { data: { user }, error: userError } = await supabase.auth.getUser()

        console.log('[UpdatePassword] User check:', user ? 'User found' : 'No user', userError ? `Error: ${userError.message}` : 'No error')

        if (userError) {
          console.error('[UpdatePassword] Error getting user:', userError)
          throw new Error('Unable to verify your identity. Please try the reset link again.')
        }

        if (!user) {
          console.error('[UpdatePassword] No user found in session')
          throw new Error('Invalid or expired reset link. Please request a new password reset.')
        }

        // Now update the password
        const { error } = await supabase.auth.updateUser({
          password
        })

        if (error) {
          console.error('[UpdatePassword] Reset error:', error)

          // Handle specific error cases
          if (error.message.includes('email') || error.message.includes('phone')) {
            setMessage({
              type: 'error',
              text: 'Session expired. Please request a new password reset from the email.'
            })
            return
          } else if (error.message.includes('new password')) {
            setMessage({
              type: 'error',
              text: 'New password cannot be the same as the old password.'
            })
            return
          } else {
            throw error
          }
        }

        console.log('[UpdatePassword] Password updated successfully')
        setMessage({
          type: 'success',
          text: 'Password updated successfully! Redirecting to login...'
        })

        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/auth/login')
        }, 2000)
      } else {
        // For regular password change (when logged in)
        const { error } = await supabase.auth.updateUser({
          password
        })

        if (error) {
          console.error('[UpdatePassword] Error updating password:', error)

          // If current password is required, show the appropriate message
          if (error.message.includes('current password') || error.message.includes('password')) {
            setMessage({
              type: 'error',
              text: 'Current password is required to change your password.'
            })
            return
          }

          throw error
        }

        console.log('[UpdatePassword] Password updated successfully')
        setMessage({
          type: 'success',
          text: 'Password updated successfully! Redirecting to login...'
        })

        // Redirect to login after 2 seconds
        setTimeout(() => {
          router.push('/auth/login')
        }, 2000)
      }
    } catch (err: any) {
      console.error('[UpdatePassword] Failed to update password:', err)
      setMessage({
        type: 'error',
        text: err.message || 'Failed to update password'
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
            {isResetFlow ? 'Reset Your Password' : 'Change Password'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            {isResetFlow
              ? 'Enter your new password below.'
              : 'Enter your current password and new password below.'
            }
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          <div className="rounded-md shadow-sm -space-y-px">
            {!isResetFlow && (
              <div>
                <label htmlFor="current-password" className="sr-only">
                  Current Password
                </label>
                <input
                  id="current-password"
                  name="current-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={''} // Not used in reset flow
                  onChange={(e) => {}}
                  className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-base bg-white dark:bg-gray-800"
                  placeholder="Current password"
                />
              </div>
            )}
            <div>
              <label htmlFor="password" className="sr-only">
                New Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-base bg-white dark:bg-gray-800 ${isResetFlow ? 'rounded-t-md' : ''}`}
                placeholder="New password (min 6 characters)"
              />
            </div>
            <div>
              <label htmlFor="confirm-password" className="sr-only">
                Confirm New Password
              </label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-3 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-base bg-white dark:bg-gray-800"
                placeholder="Confirm new password"
              />
            </div>
          </div>

          {message && (
            <div className={`text-sm text-center p-3 rounded-md ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
              {message.text}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Updating...' : (isResetFlow ? 'Reset Password' : 'Update Password')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}