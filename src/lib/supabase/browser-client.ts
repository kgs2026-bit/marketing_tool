'use client'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

// Create a custom storage that syncs between localStorage and cookies for SSR support
function createCookieSyncStorage() {
  return {
    getItem: (key: string): string | null => {
      if (typeof window === 'undefined') return null

      try {
        const localValue = localStorage.getItem(key)
        if (localValue) return localValue
      } catch (e) {
        // localStorage might be disabled
      }

      const cookies = document.cookie
        .split(';')
        .map((c) => c.trim())
        .filter(Boolean)

      for (const cookie of cookies) {
        const [name, value] = cookie.split('=')
        if (name === key) return decodeURIComponent(value)
      }

      return null
    },
    setItem: (key: string, value: string): void => {
      if (typeof window === 'undefined') return

      try {
        localStorage.setItem(key, value)
      } catch (e) {
        // ignore
      }

      const expires = new Date()
      expires.setFullYear(expires.getFullYear() + 1)
      const cookieString = `${key}=${encodeURIComponent(value)}; path=/; expires=${expires.toUTCString()}`
      document.cookie = cookieString
    },
    removeItem: (key: string): void => {
      if (typeof window === 'undefined') return

      try {
        localStorage.removeItem(key)
      } catch (e) {
        // ignore
      }

      document.cookie = `${key}=; path=/; max-age=0`
    },
  }
}

// Wrapper to detect if fetch is being blocked by extensions
function createBlockingDetection() {
  let isBlocked = false
  let isInitialized = false

  const init = () => {
    if (isInitialized) return isBlocked

    isInitialized = true

    // Quick test: does fetch to supabase work?
    try {
      const test = fetch('https://acwwxlneuqcpqdntdbnj.supabase.co/auth/v1/health', {
        method: 'HEAD',
        mode: 'no-cors', // don't trigger CORS preflight
      })
      // If fetch is overridden badly, it might throw or return then reject
      test.catch(() => { isBlocked = true })
    } catch {
      isBlocked = true
    }

    return isBlocked
  }

  return { init, isBlocked: () => isBlocked }
}

let cachedClient: SupabaseClient | null = null

export const createClient = (): SupabaseClient => {
  console.log('[browser-client] createClient called')

  if (cachedClient) {
    console.log('[browser-client] Returning cached client')
    return cachedClient
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  console.log('[browser-client] Env vars check:', {
    url: url ? 'SET' : 'MISSING',
    anonKey: anonKey ? 'SET' : 'MISSING',
  })

  if (!url || !anonKey) {
    const msg = 'Supabase environment variables are missing. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    console.error('[browser-client]', msg)
    throw new Error(msg)
  }

  console.log('[browser-client] Creating new Supabase client with custom storage')

  try {
    const supabase = createSupabaseClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: createCookieSyncStorage(),
        flowType: 'pkce',
      },
      global: {
        headers: {
          'X-Client-Info': 'email-marketing-tool',
        },
      },
    })

    console.log('[browser-client] Client created successfully')
    cachedClient = supabase
    return supabase
  } catch (err: any) {
    console.error('[browser-client] Failed to create client:', err)
    throw err
  }
}
