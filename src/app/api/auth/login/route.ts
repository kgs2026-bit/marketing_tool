import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

/**
 * Server-side login endpoint.
 * This handles authentication on the server, so the browser never directly calls Supabase.
 */
export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !supabaseKey) {
      console.error('[api/auth/login] Missing environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    // Create a server-side Supabase client with cookie handling
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        // Don't persist session on server, we'll handle cookies manually
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    // Sign in the user
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.log('[api/auth/login] Auth error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 401 }
      )
    }

    // Get the session and set cookies
    const session = data.session
    const user = data.user

    if (!session) {
      return NextResponse.json(
        { error: 'No session returned' },
        { status: 500 }
      )
    }

    // Set secure HttpOnly cookies
    const cookieStore = await cookies()
    const accessToken = session.access_token
    const refreshToken = session.refresh_token
    const expiresAt = new Date(session.expires_at! * 1000)

    // Create the session data object
    const sessionData = {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: session.expires_at,
      token_type: 'bearer',
      user: user,
    }

    // Set the session cookie that Supabase browser client expects
    cookieStore.set('sb-auth-token', JSON.stringify(sessionData), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    })

    // Also set refresh token cookie separately
    if (refreshToken) {
      cookieStore.set('sb-refresh-token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        path: '/',
      })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata,
      },
      session: {
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: session.expires_at,
      },
    })
  } catch (err: any) {
    console.error('[api/auth/login] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    )
  }
}
