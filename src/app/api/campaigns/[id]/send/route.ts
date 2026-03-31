import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClientAction()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get campaign with recipients
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select(`
        *,
        templates (id, name, subject, html_content),
        campaign_recipients (id, email)
      `)
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (campaignError) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // If no recipients, we need to create them from recipient_list or contacts
    if (!campaign.campaign_recipients || campaign.campaign_recipients.length === 0) {
      // Recipient list could be a list of contact IDs or directly email objects
      const recipients = campaign.recipient_list

      if (!recipients || recipients.length === 0) {
        return NextResponse.json({ error: 'No recipients specified' }, { status: 400 })
      }

      // Create campaign_recipient records
      const recipientData = recipients.map((recip: any) => {
        const email = typeof recip === 'string' ? recip : recip.email
        return {
          campaign_id: campaign.id,
          email,
          status: 'pending',
        }
      })

      const { error: insertError } = await supabase
        .from('campaign_recipients')
        .insert(recipientData)

      if (insertError) {
        console.error('Error creating recipients:', insertError)
        // Continue anyway - we'll fetch contacts fresh
      }
    }

    // Re-fetch campaign with fresh recipients
    const { data: freshCampaign } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_recipients (id, email)
      `)
      .eq('id', id)
      .single()

    if (!freshCampaign || !freshCampaign.campaign_recipients) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    // Update campaign status to sending
    await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id)

    // Get app URL for tracking
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Use verified domain as sender, user's email as reply-to
    // This allows sending from a verified domain even if users have unverified emails (like Gmail)
    const verifiedFromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
    const userEmail = user.email || ''
    const senderName = user.user_metadata?.full_name ||
                       user.user_metadata?.name ||
                       user.email?.split('@')[0] ||
                       'User'

    // Send emails via Resend
    const sendPromises = freshCampaign.campaign_recipients.map(async (recipient: any) => {
      try {
        // Generate tracking pixels and click tracking links
        // For simplicity, we'll embed tracking pixel and convert links
        let htmlContent = campaign.templates?.html_content || campaign.html_content || ''

        // Add tracking pixel
        const trackingPixel = `<img src="${appUrl}/api/track/open/${recipient.id}" width="1" height="1" alt="" style="display:none;" />`
        htmlContent = htmlContent.replace('</body>', `${trackingPixel}</body>`)

        // Replace variables
        const { data: contact } = await supabase
          .from('contacts')
          .select('*')
          .eq('email', recipient.email)
          .single()

        let personalizedContent = htmlContent
        personalizedContent = personalizedContent.replace(/\{\{first_name\}\}/g, contact?.first_name || '')
        personalizedContent = personalizedContent.replace(/\{\{last_name\}\}/g, contact?.last_name || '')
        personalizedContent = personalizedContent.replace(/\{\{email\}\}/g, contact?.email || '')
        personalizedContent = personalizedContent.replace(/\{\{company\}\}/g, contact?.company || '')
        personalizedContent = personalizedContent.replace(/\{\{unsubscribe_link\}\}/g, `${appUrl}/api/unsubscribe/${recipient.id}`)

        const subject = (campaign.templates?.subject || campaign.subject || '').replace(/\{\{first_name\}\}/g, contact?.first_name || '')

        // Send email using verified domain as sender, user's email as reply-to
        const { data, error } = await resend.emails.send({
          from: `${senderName} <${verifiedFromEmail}>`,
          to: [recipient.email],
          subject,
          html: personalizedContent,
          replyTo: userEmail, // Replies go to user's actual email (Gmail, etc.)
          headers: {
            'X-Campaign-ID': campaign.id,
            'X-Recipient-ID': recipient.id,
          },
        })

        if (error) {
          throw error
        }

        // Update recipient status
        await supabase
          .from('campaign_recipients')
          .update({
            status: 'delivered',
            sent_at: new Date().toISOString(),
            delivered_at: new Date().toISOString(),
            message_id: data.id,
          })
          .eq('id', recipient.id)

        return { success: true, recipientId: recipient.id, messageId: data.id }
      } catch (err: any) {
        console.error(`Failed to send to ${recipient.email}:`, err)
        // Update recipient as bounced
        await supabase
          .from('campaign_recipients')
          .update({
            status: 'bounced',
            bounced_at: new Date().toISOString(),
            bounce_reason: err.message,
          })
          .eq('id', recipient.id)
        return { success: false, email: recipient.email, error: err.message }
      }
    })

    const results = await Promise.all(sendPromises)
    const successCount = results.filter((r) => r.success).length
    const failureCount = results.length - successCount

    // Update campaign status
    const newStatus = failureCount > 0 ? 'sent' : 'sent' // always sent, but we could have partial failures
    await supabase
      .from('campaigns')
      .update({
        status: newStatus,
        sent_at: new Date().toISOString(),
      })
      .eq('id', campaign.id)

    return NextResponse.json({
      success: true,
      sent: successCount,
      failed: failureCount,
      total: results.length,
      errors: results.filter(r => !r.success).map(r => ({
        email: r.email,
        error: r.error
      }))
    })
  } catch (err: any) {
    console.error('Campaign send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
