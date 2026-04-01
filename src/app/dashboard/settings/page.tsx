'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

export default function SettingsPage() {
  const supabase = createClient()
  const [provider, setProvider] = useState<'resend' | 'gmail'>('resend')
  const [gmailEmail, setGmailEmail] = useState('')
  const [appPassword, setAppPassword] = useState('')
  const [resendApiKey, setResendApiKey] = useState('')
  const [defaultSenderName, setDefaultSenderName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    // Load config for current provider when it changes
    const loadProviderConfig = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('user_email_configs')
          .select('*')
          .eq('user_id', user.id)
          .eq('provider', provider)
          .single()

        if (data) {
          setDefaultSenderName(data.default_sender_name || '')
          if (provider === 'gmail') {
            setGmailEmail(data.smtp_username || '')
          }
        } else {
          setDefaultSenderName('')
          if (provider === 'gmail') {
            setGmailEmail('')
          }
        }
      } catch (error) {
        console.error('Error loading provider config:', error)
      }
    }

    loadProviderConfig()
  }, [provider])

  const loadConfig = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('user_email_configs')
        .select('*')
        .eq('user_id', user.id)
        .eq('provider', 'resend')
        .single()

      if (data) {
        setProvider(data.provider || 'resend')
        setDefaultSenderName(data.default_sender_name || '')
        if (data.provider === 'gmail') {
          setGmailEmail(data.smtp_username || '')
          // Don't load password for security
        }
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      // For Gmail, validate email format
      if (provider === 'gmail') {
        if (!gmailEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gmailEmail)) {
          throw new Error('Please enter a valid Gmail address')
        }
        if (!appPassword) {
          throw new Error('Please enter your Gmail App Password')
        }
        if (!gmailEmail.endsWith('@gmail.com')) {
          throw new Error('Only @gmail.com addresses are supported')
        }
      }

      // Upsert configuration
      const { error } = await supabase
        .from('user_email_configs')
        .upsert({
          user_id: user.id,
          provider,
          default_sender_name: defaultSenderName || null,
          smtp_host: 'smtp.gmail.com',
          smtp_port: 465,
          smtp_username: provider === 'gmail' ? gmailEmail : null,
          smtp_password: provider === 'gmail' ? appPassword : null,
          smtp_secure: true,
        })

      if (error) throw error

      setMessage({ type: 'success', text: 'Email settings saved successfully!' })
      if (provider !== 'gmail') {
        setGmailEmail('')
        setAppPassword('')
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Email Settings</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Configure your email provider for sending campaigns</p>
      </div>

      <div className="bg-background dark:bg-card p-6 rounded-lg shadow max-w-2xl">
        <form onSubmit={saveConfig} className="space-y-6">
          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              Email Provider
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="resend"
                  checked={provider === 'resend'}
                  onChange={(e) => setProvider(e.target.value as 'resend')}
                  className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-foreground">
                  <strong>Resend</strong> (Recommended)
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Use a verified domain with Resend API. Best for production.
                  </span>
                </span>
              </label>
              {provider === 'resend' && (
                <div className="ml-6 space-y-4">
                  <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm">
                    <p className="text-blue-800 dark:text-blue-300">
                      Resend uses the globally configured domain. Make sure your admin has set up
                      <code className="mx-1 px-1 bg-blue-100 dark:bg-blue-800 rounded">RESEND_FROM_EMAIL</code>
                      with a verified domain in the Resend dashboard.
                    </p>
                  </div>
                  <div className="border-t border-blue-200 dark:border-blue-800 pt-4">
                    <label className="block text-sm font-medium text-foreground mb-2">
                      Default Sender Name (optional)
                    </label>
                    <input
                      type="text"
                      value={defaultSenderName}
                      onChange={(e) => setDefaultSenderName(e.target.value)}
                      placeholder="Your full name or business name"
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      This will be pre-filled when creating campaigns. Can be overridden per campaign.
                    </p>
                  </div>
                </div>
              )}
              <label className="flex items-center mt-3">
                <input
                  type="radio"
                  value="gmail"
                  checked={provider === 'gmail'}
                  onChange={(e) => setProvider(e.target.value as 'gmail')}
                  className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-foreground">
                  <strong>Gmail (SMTP)</strong>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    Use your personal Gmail account. Limited to 500 emails/day. Requires App Password.
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* Gmail Settings */}
          {provider === 'gmail' && (
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Gmail Address
                </label>
                <input
                  type="email"
                  value={gmailEmail}
                  onChange={(e) => setGmailEmail(e.target.value)}
                  placeholder="your@gmail.com"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Must be a @gmail.com address
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">
                  Gmail App Password
                </label>
                <input
                  type="password"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  placeholder="16-character app password"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  required
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Create an app password in your Google Account settings (2FA required).{' '}
                  <a
                    href="https://myaccount.google.com/apppasswords"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Generate App Password →
                  </a>
                </p>
              </div>
            </div>
          )}

          {message && (
            <div className={`p-3 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
              {message.text}
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </form>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-md">
        <h3 className="font-medium text-yellow-900 dark:text-yellow-500 mb-2">Important Notes</h3>
        <ul className="text-sm text-yellow-800 dark:text-yellow-400 space-y-1">
          <li>• <strong>Resend:</strong> Requires a verified domain in Resend. Admin must set up global credentials.</li>
          <li>• <strong>Gmail:</strong> Limited to 500 emails/day. Use App Password, not your regular password.</li>
          <li>• Credentials are stored per-user but are not encrypted in this demo (use Supabase Vault for production).</li>
          <li>• You can switch providers at any time.</li>
        </ul>
      </div>
    </div>
  )
}
