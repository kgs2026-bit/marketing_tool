import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> }
) {
  const supabase = await createClientAction()
  const { recipientId } = await params

  try {
    // Get the recipient to find the contact email
    const { data: recipient } = await supabase
      .from('campaign_recipients')
      .select('email')
      .eq('id', recipientId)
      .single()

    if (recipient) {
      // Mark the contact as unsubscribed
      await supabase
        .from('contacts')
        .update({
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        })
        .eq('email', recipient.email)
    }

    // Render a simple thank you page
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Unsubscribed</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f9fafb;
            }
            .container {
              text-align: center;
              padding: 2rem;
              max-width: 400px;
            }
            h1 { color: #374151; margin-bottom: 1rem; }
            p { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>You have been unsubscribed</h1>
            <p>You will no longer receive emails from us.</p>
          </div>
        </body>
      </html>
    `

    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
  } catch (err) {
    console.error('Unsubscribe error:', err)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}
