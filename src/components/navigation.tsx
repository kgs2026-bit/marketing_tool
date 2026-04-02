'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser-client'
import { useEffect, useState } from 'react'
import { useTheme } from '@/components/providers/theme-provider'

export default function Navigation() {
  const pathname = usePathname()
  const supabase = createClient()
  const { theme, setTheme, actualTheme } = useTheme()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
      setLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/auth/login'
  }

  const navLinks = [
    { href: '/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/dashboard/contacts', label: 'Contacts', icon: '👥' },
    { href: '/dashboard/templates', label: 'Templates', icon: '📧' },
    { href: '/dashboard/campaigns', label: 'Campaigns', icon: '🚀' },
    { href: '/dashboard/analytics', label: 'Analytics', icon: '📈' },
    { href: '/dashboard/profile', label: 'Profile', icon: '👤' },
    { href: '/dashboard/settings', label: 'Settings', icon: '⚙️' },
  ]

  if (loading) {
    return (
      <nav className="bg-background shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-blue-600 dark:text-blue-400">EmailTool</span>
            </div>
          </div>
        </div>
      </nav>
    )
  }

  return (
    <nav className="bg-background dark:bg-card shadow">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link href="/dashboard" className="text-xl font-bold text-blue-600 dark:text-blue-400">
              EmailTool
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            {navLinks.map((link) => {
              // Fix active state: Dashboard only active on /dashboard exactly, others on exact OR subpages
              let isActive = false
              if (link.href === '/dashboard') {
                isActive = pathname === '/dashboard' || pathname === '/dashboard/'
              } else {
                isActive = pathname === link.href || pathname.startsWith(link.href + '/')
              }

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-muted dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="mr-2">{link.icon}</span>
                  {link.label}
                </Link>
              )
            })}
          </div>
          <div className="flex items-center space-x-4">
            {/* Theme Toggle */}
            <button
              onClick={() => setTheme(actualTheme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-lg bg-background dark:bg-card border border-gray-300 dark:border-gray-600 hover:bg-muted dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm transition-colors"
              title={actualTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {actualTheme === 'dark' ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {user && (
              <div className="flex items-center space-x-3">
                <span className="text-sm text-gray-700 dark:text-gray-300">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="px-3 py-1.5 text-sm font-medium bg-background dark:bg-card border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-muted dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 shadow-sm transition-colors"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      <div className="md:hidden border-t border-gray-200 dark:border-gray-700">
        <div className="px-2 pt-2 pb-3 space-y-1">
          {navLinks.map((link) => {
            // Match desktop logic: Dashboard only on exact, others on exact OR subpages
            let isActive = false
            if (link.href === '/dashboard') {
              isActive = pathname === '/dashboard' || pathname === '/dashboard/'
            } else {
              isActive = pathname === link.href || pathname.startsWith(link.href + '/')
            }

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center px-3 py-2 rounded-md text-base font-medium ${
                  isActive
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-muted dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <span className="mr-3">{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
          {user && (
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-600 dark:text-gray-300 hover:bg-muted dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200"
            >
              Sign out
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
