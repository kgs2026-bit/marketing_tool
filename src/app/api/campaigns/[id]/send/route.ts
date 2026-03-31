import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'
import { randomUUID } from 'node:crypto'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClientAction()

  // Check for cron secret (for scheduled campaigns)
  const cronSecret = request.headers.get('x-cron-secret')
  const isCronCall = cronSecret && cronSecret === process.env.CRON_SECRET

  let user
  if (isCronCall) {
    // For cron calls, we need to fetch the campaign's user and their auth data
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('user_id')
      .eq('id', id)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Fetch user email and metadata from auth.users using service role
    const { data: authUser } = await supabase
      .from('auth.users')
      .select('email, user_metadata')
      .eq('id', campaign.user_id)
      .single()

    if (!authUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    user = {
      id: campaign.user_id,
      email: authUser.email,
      user_metadata: authUser.user_metadata
    }
  } else {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    user = authUser
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    // Get campaign with recipients and email provider
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

    const provider = campaign.email_provider || 'resend'

    // If no recipients, create them from recipient_list (contact IDs)
    if (!campaign.campaign_recipients || campaign.campaign_recipients.length === 0) {
      const contactIds = campaign.recipient_list

      if (!contactIds || contactIds.length === 0) {
        return NextResponse.json({ error: 'No recipients specified' }, { status: 400 })
      }

      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, email')
        .in('id', contactIds)
        .neq('status', 'unsubscribed')  // Exclude unsubscribed contacts

      if (contactsError) {
        console.error('Error fetching contacts:', contactsError)
        return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
      }

      const recipientData = contacts.map((contact: any) => ({
        campaign_id: campaign.id,
        contact_id: contact.id,
        email: contact.email,
        status: 'pending',
      }))

      const { error: insertError } = await supabase
        .from('campaign_recipients')
        .insert(recipientData)

      if (insertError) {
        console.error('Error creating recipients:', insertError)
      }
    }

    // Re-fetch campaign with fresh recipients (include contact status to filter unsubscribed)
    const { data: freshCampaign } = await supabase
      .from('campaigns')
      .select(`
        *,
        campaign_recipients (
          id,
          email,
          contact_id,
          contacts (id, email, status)
        )
      `)
      .eq('id', id)
      .single()

    if (!freshCampaign || !freshCampaign.campaign_recipients) {
      return NextResponse.json({ error: 'No recipients found' }, { status: 400 })
    }

    // Filter out unsubscribed contacts
    const recipientsToSend = (freshCampaign.campaign_recipients as any[])
      .filter((recipient: any) => {
        const contact = recipient.contacts as any
        return contact?.status !== 'unsubscribed'
      })

    if (recipientsToSend.length === 0) {
      return NextResponse.json(
        { error: 'All recipients have unsubscribed. No emails to send.' },
        { status: 400 }
      )
    }

    // Update campaign status to sending
    await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id)

    // Get app URL for tracking
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    // Get sender name - use campaign's custom sender_name if set, otherwise fall back to user's name
    const senderName = campaign.sender_name ||
                       user.user_metadata?.full_name ||
                       user.user_metadata?.name ||
                       user.email?.split('@')[0] ||
                       'User'

    // Helper function to add random delay between 3-5 minutes (180-300 seconds)
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    // Send emails based on provider with delays
    const sendPromises = recipientsToSend.map(async (recipient: any, index: number) => {
      // Add random 3-5 minute delay before each email (except first)
      if (index > 0) {
        const delayMs = Math.random() * (5 * 60 * 1000 - 3 * 60 * 1000) + 3 * 60 * 1000
        await sleep(delayMs)
      }
      try {
        // Generate tracking and replace variables
        let htmlContent = campaign.templates?.html_content || campaign.html_content || ''
        const trackingPixel = `<img src="${appUrl}/api/track/open/${recipient.id}" width="1" height="1" alt="" style="display:none;" />`

        // Insert tracking pixel before </body> if exists, otherwise append to end
        if (htmlContent.includes('</body>')) {
          htmlContent = htmlContent.replace('</body>', `${trackingPixel}</body>`)
        } else if (htmlContent.includes('</html>')) {
          htmlContent = htmlContent.replace('</html>', `${trackingPixel}</html>`)
        } else {
          htmlContent = htmlContent + trackingPixel
        }

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

        // Add click tracking: rewrite all http/https links
        const trackingLinksToCreate: any[] = []
        personalizedContent = personalizedContent.replace(/href\s*=\s*["']([^"']+)["']/gi, (match: string, url: string) => {
          // Skip non-http(s) URLs (like mailto, tel, #, javascript) and URLs already tracked
          if (!url.startsWith('http')) {
            return match
          }
          const trackingId = randomUUID()
          trackingLinksToCreate.push({
            tracking_id: trackingId,
            campaign_recipient_id: recipient.id,
            original_url: url,
            click_count: 0,
            created_at: new Date().toISOString()
          })
          return `href="/api/track/click/${trackingId}"`
        })

        // Insert tracking links into DB (non-blocking if fails)
        if (trackingLinksToCreate.length > 0) {
          const { error: trackingError } = await supabase.from('tracking_links').insert(trackingLinksToCreate)
          if (trackingError) {
            console.error('Error creating tracking links:', trackingError)
          }
        }

        const subject = (campaign.templates?.subject || campaign.subject || '').replace(/\{\{first_name\}\}/g, contact?.first_name || '')

        if (provider === 'resend') {
          // Use Resend API - send from user's email directly
          const userEmail = user.email || ''
          const fromAddress = userEmail ? `${senderName} <${userEmail}>` : `${senderName} <${process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'}>`

          const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [recipient.email],
            subject,
            html: personalizedContent,
            headers: {
              'X-Campaign-ID': campaign.id,
              'X-Recipient-ID': recipient.id,
            },
          })

          if (error) throw error

          // Update recipient
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

        } else if (provider === 'gmail') {
          // Use Gmail SMTP
          const { data: emailConfig } = await supabase
            .from('user_email_configs')
            .select('smtp_username, smtp_password')
            .eq('user_id', user.id)
            .eq('provider', 'gmail')
            .single()

          if (!emailConfig || !emailConfig.smtp_username || !emailConfig.smtp_password) {
            throw new Error('Gmail not configured. Please set up Gmail in Settings.')
          }

          // Create SMTP transporter
          const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 465,
            secure: true,
            auth: {
              user: emailConfig.smtp_username,
              pass: emailConfig.smtp_password,
            },
          })

          // Send email
          const { messageId } = await new Promise<{ messageId: string }>((resolve, reject) => {
            transporter.sendMail({
              from: emailConfig.smtp_username, // Must match auth user
              to: recipient.email,
              subject,
              html: personalizedContent,
              headers: {
                'X-Campaign-ID': campaign.id,
                'X-Recipient-ID': recipient.id,
              },
            }, (error, info) => {
              if (error) reject(error)
              else resolve(info as { messageId: string })
            })
          })

          // Update recipient
          await supabase
            .from('campaign_recipients')
            .update({
              status: 'delivered',
              sent_at: new Date().toISOString(),
              delivered_at: new Date().toISOString(),
              message_id: messageId,
            })
            .eq('id', recipient.id)

          return { success: true, recipientId: recipient.id, messageId }
        } else {
          throw new Error(`Unknown provider: ${provider}`)
        }
      } catch (err: any) {
        console.error(`Failed to send to ${recipient.email}:`, err)
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

    await supabase
      .from('campaigns')
      .update({
        status: 'sent',
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
