'use client'

import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

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
              return localStorage.getItem(key)
            } catch (e) {
              return null
            }
          },
          setItem: (key: string, value: string) => {
            if (typeof window === 'undefined') return
            try {
              localStorage.setItem(key, value)
            } catch (e) {
              // ignore
            }
          },
          removeItem: (key: string) => {
            if (typeof window === 'undefined') return
            try {
              localStorage.removeItem(key)
            } catch (e) {
              // ignore
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
