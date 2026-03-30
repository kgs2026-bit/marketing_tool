import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Log the webhook for debugging
    console.log('Resend webhook received:', body)

    // Resend sends events in different formats - v2 has .type and .data
    const event = body.event || body.type
    const data = body.data || body

    const supabase = await createClientAction()

    // Extract message ID and recipient from event data
    const messageId = data.message_id || data.id
    const email = data.email || data.recipient?.email || data.to?.[0]
    const eventType = event || data.event

    if (!email || !messageId) {
      console.warn('Webhook missing email or message_id:', body)
      return NextResponse.json({ received: true })
    }

    // Find the campaign recipient by message_id or email
    let { data: recipient, error } = await supabase
      .from('campaign_recipients')
      .select('id, campaign_id, status')
      .eq('message_id', messageId)
      .single()

    if (error || !recipient) {
      // Try to find by email if no message_id match (might be bounce only)
      const { data: byEmail } = await supabase
        .from('campaign_recipients')
        .select('id, campaign_id, status')
        .eq('email', email)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (byEmail) {
        recipient = byEmail
      } else {
        console.warn('No matching campaign recipient for email:', email, 'message_id:', messageId)
        return NextResponse.json({ received: true })
      }
    }

    // Update status based on event type
    const updates: any = {}

    switch (eventType) {
      case 'email.sent':
      case 'email.delivered':
        updates.status = 'delivered'
        updates.delivered_at = new Date().toISOString()
        break
      case 'email.opened':
        updates.status = 'opened'
        updates.opened_at = new Date().toISOString()
        break
      case 'email.clicked':
        updates.status = 'clicked'
        updates.clicked_at = new Date().toISOString()
        // Could also record click in separate tracking table
        break
      case 'email.bounced':
      case 'email.failed':
        updates.status = 'bounced'
        updates.bounced_at = new Date().toISOString()
        updates.bounce_reason = data.reason || data.description || 'Bounced'
        break
      case 'email.complained':
        updates.status = 'unsubscribed' // spam complaint
        break
      default:
        console.log('Unhandled Resend event:', eventType)
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('campaign_recipients')
        .update(updates)
        .eq('id', recipient.id)

      if (updateError) {
        console.error('Error updating campaign recipient:', updateError)
      }
    }

    return NextResponse.json({ received: true })
  } catch (err: any) {
    console.error('Webhook processing error:', err)
    return NextResponse.json({ error: 'Processing error' }, { status: 500 })
  }
}
