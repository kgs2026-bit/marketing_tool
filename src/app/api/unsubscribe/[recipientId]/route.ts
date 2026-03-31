import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> }
) {
  const supabase = await createClientAction()
  const { recipientId } = await params
  const { searchParams } = new URL(request.url)
  const emailParam = searchParams.get('email')

  try {
    // If email query parameter is provided (e.g., from test emails), handle generic unsubscribe
    if (emailParam) {
      const email = emailParam.toLowerCase().trim()

      // Check if contact exists
      const { data: contact, error: fetchError } = await supabase
        .from('contacts')
        .select('id, email, status, unsubscribed_at')
        .eq('email', email)
        .single()

      if (fetchError || !contact) {
        // Contact not found - create a new record as unsubscribed
        await supabase
          .from('contacts')
          .insert({
            email,
            status: 'unsubscribed',
            unsubscribed_at: new Date().toISOString(),
          })

        return renderUnsubscribedPage('You have been unsubscribed. You will no longer receive emails from us.')
      }

      // Check if already unsubscribed
      if (contact.status === 'unsubscribed') {
        return renderAlreadyUnsubscribedPage()
      }

      // Update contact status
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        })
        .eq('id', contact.id)

      if (updateError) {
        console.error('Failed to unsubscribe contact:', updateError)
      }

      return renderUnsubscribedPage('You have been unsubscribed. You will no longer receive emails from us.')
    }

    // Otherwise, use recipientId for campaign-specific unsubscribe
    const { data: recipient, error: recipientError } = await supabase
      .from('campaign_recipients')
      .select(`
        id,
        email,
        contact_id,
        contacts (id, email, status, unsubscribed_at)
      `)
      .eq('id', recipientId)
      .single()

    if (recipientError || !recipient) {
      return NextResponse.json(
        { error: 'Invalid unsubscribe link' },
        { status: 404 }
      )
    }

    const contact = recipient.contacts as any

    // Check if already unsubscribed
    if (contact?.status === 'unsubscribed') {
      return renderAlreadyUnsubscribedPage()
    }

    // If we have a contact_id, update the contacts table directly
    if (contact?.id) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        })
        .eq('id', contact.id)

      if (updateError) {
        console.error('Failed to update contact:', updateError)
      }
    } else {
      // Fallback: if no contact_id, create/update contact record by email
      const { error: upsertError } = await supabase
        .from('contacts')
        .upsert(
          {
            email: recipient.email,
            status: 'unsubscribed',
            unsubscribed_at: new Date().toISOString(),
          },
          { onConflict: 'email' }
        )

      if (upsertError) {
        console.error('Failed to upsert contact:', upsertError)
      }
    }

    // Also mark this specific recipient as unsubscribed (for historical tracking)
    await supabase
      .from('campaign_recipients')
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .eq('id', recipientId)

    return renderUnsubscribedPage('You have been unsubscribed. You will no longer receive emails from us.')
  } catch (err) {
    console.error('Unsubscribe error:', err)
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 })
  }
}

function renderUnsubscribedPage(message: string): NextResponse {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Unsubscribed</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
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
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          }
          h1 { color: #374151; margin-bottom: 1rem; font-size: 1.5rem; }
          p { color: #6b7280; line-height: 1.6; }
          .logo { margin-bottom: 1.5rem; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 12l2 2 4-4" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M12 3C7.03 3 3 7.03 3 12s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" stroke="#374151" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <h1>Unsubscribed</h1>
          <p>${message}</p>
        </div>
      </body>
    </html>
  `
  return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } })
}

function renderAlreadyUnsubscribedPage(): NextResponse {
  return renderUnsubscribedPage('You have already unsubscribed from our emails. You will not receive any further communications.')
}
