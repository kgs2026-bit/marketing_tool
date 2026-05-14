import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

/**
 * Server-side Supabase client that reads auth token from cookies.
 */
export async function createSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase server credentials. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.')
  }

  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('sb-auth-token')?.value

  let accessToken: string | undefined

  if (sessionCookie) {
    try {
      const sessionData = JSON.parse(sessionCookie)
      accessToken = sessionData.access_token
    } catch {
      accessToken = sessionCookie
    }
  }

  return createSupabaseClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    },
  })
}

// Alias for backward compatibility
export const createServerClient = createSupabaseServerClient
