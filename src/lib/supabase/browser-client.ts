'use client'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

let cachedClient: SupabaseClient | null = null

// Get the storage key format that Supabase expects
function getStorageKey(key: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const urlKey = url.split('//')[1].replace('.', '-')
  return `sb-${urlKey}-${key}`
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
        storage: {
          getItem: (key: string) => {
            if (typeof window === 'undefined') return null
            try {
              const storageKey = getStorageKey(key)
              console.log('[browser-client] Getting item:', storageKey)
              return localStorage.getItem(storageKey)
            } catch (e) {
              console.error('[browser-client] Error getting item:', e)
              return null
            }
          },
          setItem: (key: string, value: string) => {
            if (typeof window === 'undefined') return
            try {
              const storageKey = getStorageKey(key)
              console.log('[browser-client] Setting item:', storageKey)
              localStorage.setItem(storageKey, value)
            } catch (e) {
              console.error('[browser-client] Error setting item:', e)
            }
          },
          removeItem: (key: string) => {
            if (typeof window === 'undefined') return
            try {
              const storageKey = getStorageKey(key)
              console.log('[browser-client] Removing item:', storageKey)
              localStorage.removeItem(storageKey)
            } catch (e) {
              console.error('[browser-client] Error removing item:', e)
            }
          },
        },
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
