import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server-client'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    console.log('[API/ResetPassword] Request to reset password for:', email)

    const supabase = createServerClient()

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/update-password`,
    })

    if (error) {
      console.error('[API/ResetPassword] Error:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      )
    }

    console.log('[API/ResetPassword] Reset email sent successfully')
    return NextResponse.json({
      success: true,
      message: 'Password reset instructions have been sent to your email.'
    })
  } catch (error: any) {
    console.error('[API/ResetPassword] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}