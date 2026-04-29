import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export async function GET() {
  try {
    const cookieStore = await cookies()

    // Get the session cookie
    const sessionCookie = cookieStore.get('sb-auth-token')?.value

    if (!sessionCookie) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    // Try to parse the session from the cookie
    let sessionData
    try {
      sessionData = JSON.parse(sessionCookie)
    } catch {
      // If it's not JSON, it's just the access token
      sessionData = { access_token: sessionCookie }
    }

    // Validate the session with Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !supabaseKey) {
      console.error('[api/auth/session] Missing environment variables')
      return NextResponse.json({ user: null }, { status: 200 })
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    // Get the user from the access token
    const { data: { user }, error } = await supabase.auth.getUser(sessionData.access_token)

    if (error || !user) {
      console.error('[api/auth/session] Invalid session:', error?.message)
      return NextResponse.json({ user: null }, { status: 200 })
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      }
    })
  } catch (error) {
    console.error('[api/auth/session] Error:', error)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
