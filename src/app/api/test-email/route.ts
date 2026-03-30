import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set')
      return NextResponse.json(
        { error: 'RESEND_API_KEY is not configured. Please set it in Vercel environment variables.' },
        { status: 500 }
      )
    }

    const resend = new Resend(resendApiKey)

    const data = await resend.emails.send({
      from: fromEmail,
      to: email,
      subject: 'Test Email from EmailFlow',
      html: `
        <h1>Welcome!</h1>
        <p>This is a test email to verify Resend is working correctly.</p>
        <p>If you receive this, your Resend configuration is working.</p>
      `,
    })

    return NextResponse.json({
      success: true,
      message: 'Test email sent successfully',
      data
    })
  } catch (error: any) {
    console.error('Resend error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to send test email' },
      { status: 500 }
    )
  }
}
