import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resendApiKey = process.env.RESEND_API_KEY
const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const unsubscribeUrl = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(email)}`

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
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; }
              .content { padding: 20px; background: #f9fafb; border-radius: 8px; }
              .unsubscribe { font-size: 12px; color: #6b7280; margin-top: 30px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
              a { color: #3b82f6; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="content">
              <h1>Welcome!</h1>
              <p>This is a test email to verify Resend is working correctly.</p>
              <p>If you receive this, your Resend configuration is working.</p>
              <div class="unsubscribe">
                <p>If you no longer wish to receive these emails, you can
                  <a href="${unsubscribeUrl}">unsubscribe here</a>.
                </p>
              </div>
            </div>
          </body>
        </html>
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
