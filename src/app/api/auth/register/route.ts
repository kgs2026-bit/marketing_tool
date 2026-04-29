import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const { email, password, firstName, lastName, company, phone, website, industry } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

    if (!supabaseUrl || !supabaseKey) {
      console.error('[api/auth/register] Missing environment variables')
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: `${firstName || ''} ${lastName || ''}`.trim(),
          first_name: firstName || '',
          last_name: lastName || '',
          company: company || '',
          phone: phone || '',
          website: website || '',
          industry: industry || '',
        },
      },
    })

    if (error) {
      console.log('[api/auth/register] Auth error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    console.log('[api/auth/register] Registration successful:', data)

    return NextResponse.json({
      success: true,
      user: {
        id: data.user?.id,
        email: data.user?.email,
        user_metadata: data.user?.user_metadata,
      },
      message: 'Registration successful. Please check your email to verify your account.',
    })
  } catch (err: any) {
    console.error('[api/auth/register] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: err.message },
      { status: 500 }
    )
  }
}
