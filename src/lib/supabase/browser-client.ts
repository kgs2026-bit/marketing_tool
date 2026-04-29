'use client'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

// Get the storage key format that Supabase expects
function getStorageKey(key: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const urlKey = url.split('//')[1].replace('.', '-')
  return `sb-${urlKey}-${key}`
}

// Custom storage that reads from cookies and writes to localStorage
function createCustomStorage() {
  return {
    getItem: (key: string) => {
      if (typeof window === 'undefined') return null

      try {
        const storageKey = getStorageKey(key)

        // First try to get from localStorage (for backward compatibility)
        const localStorageValue = localStorage.getItem(storageKey)
        if (localStorageValue) {
          console.log('[browser-client] Found session in localStorage:', storageKey)
          return localStorageValue
        }

        // If not in localStorage, try to get from document.cookie
        const cookies = document.cookie.split(';')
        for (const cookie of cookies) {
          const [name, value] = cookie.trim().split('=')
          if (name === 'sb-auth-token' && value) {
            console.log('[browser-client] Found session in cookie')
            // Parse the cookie value to get the session data
            try {
              const sessionData = JSON.parse(decodeURIComponent(value))
              return JSON.stringify(sessionData)
            } catch {
              // If it's not JSON, return as-is
              return value
            }
          }
        }

        console.log('[browser-client] No session found in localStorage or cookies')
        return null
      } catch (e) {
        console.error('[browser-client] Error getting item:', e)
        return null
      }
    },
    setItem: (key: string, value: string) => {
      if (typeof window === 'undefined') return

      try {
        const storageKey = getStorageKey(key)
        console.log('[browser-client] Setting item in localStorage:', storageKey)
        localStorage.setItem(storageKey, value)
      } catch (e) {
        console.error('[browser-client] Error setting item:', e)
      }
    },
    removeItem: (key: string) => {
      if (typeof window === 'undefined') return

      try {
        const storageKey = getStorageKey(key)
        console.log('[browser-client] Removing item from localStorage:', storageKey)
        localStorage.removeItem(storageKey)
      } catch (e) {
        console.error('[browser-client] Error removing item:', e)
      }
    },
  }
}

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

  console.log('[browser-client] Creating new Supabase client')

  try {
    const supabase = createSupabaseClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: createCustomStorage(),
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
