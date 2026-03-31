import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'
import { Resend } from 'resend'
import nodemailer from 'nodemailer'

const resend = new Resend(process.env.RESEND_API_KEY!)

export async function GET(request: NextRequest) {
  const supabase = await createClientAction()

  // This endpoint should be protected with a secret key for cron jobs
  const secret = request.nextUrl.searchParams.get('secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date().toISOString()
    console.log(`[Scheduled] Cron triggered at ${now}`)

    // Find campaigns that are scheduled and scheduled_at <= now
    const { data: allScheduled, error: checkError } = await supabase
      .from('campaigns')
      .select('id, name, scheduled_at, status')
      .eq('status', 'scheduled')

    if (checkError) throw checkError

    console.log('[Scheduled] All scheduled campaigns in DB:', allScheduled?.map(c => ({
      id: c.id,
      name: c.name,
      scheduled_at: c.scheduled_at,
      scheduled_at_type: typeof c.scheduled_at,
      now: now,
    })))

    const { data: dueCampaigns, error } = await supabase
      .from('campaigns')
      .select('id, user_id, scheduled_at, name')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)

    if (error) throw error

    if (!dueCampaigns || dueCampaigns.length === 0) {
      console.log('[Scheduled] No campaigns due for sending (dueCampaigns empty)')
      return NextResponse.json({ message: 'No scheduled campaigns to send' })
    }

    console.log(`[Scheduled] Found ${dueCampaigns.length} campaign(s) due:`, dueCampaigns.map(c => ({ id: c.id, name: c.name, scheduled_at: c.scheduled_at })))

    // Mark all due campaigns as 'sending' to prevent duplicate sends
    const campaignIds = dueCampaigns.map(c => c.id)
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .in('id', campaignIds)

    if (updateError) {
      console.error('[Scheduled] Error marking campaigns as sending:', updateError)
    } else {
      console.log('[Scheduled] Marked campaigns as sending:', campaignIds)
    }

    const results = []

    for (const campaign of dueCampaigns) {
      console.log(`[Scheduled] Sending campaign ${campaign.id}...`)
      try {
        // Call the existing send endpoint for each campaign with cron secret
        const response = await fetch(`${request.nextUrl.origin}/api/campaigns/${campaign.id}/send`, {
          method: 'POST',
          headers: {
            'x-cron-secret': process.env.CRON_SECRET || ''
          }
        })

        if (response.ok) {
          console.log(`[Scheduled] Successfully sent campaign ${campaign.id}`)
          results.push({ campaignId: campaign.id, status: 'sent' })
        } else {
          const errorText = await response.text()
          console.error(`[Scheduled] Failed to send campaign ${campaign.id}:`, errorText)
          // If send fails, revert status back to scheduled
          await supabase
            .from('campaigns')
            .update({ status: 'scheduled' })
            .eq('id', campaign.id)
          results.push({ campaignId: campaign.id, status: 'failed', error: errorText })
        }
      } catch (err: any) {
        console.error(`[Scheduled] Error sending campaign ${campaign.id}:`, err.message)
        await supabase
          .from('campaigns')
          .update({ status: 'scheduled' })
          .eq('id', campaign.id)
        results.push({ campaignId: campaign.id, status: 'error', error: err.message })
      }
    }

    console.log(`[Scheduled] Completed. Results:`, results)
    return NextResponse.json({
      message: `Processed ${dueCampaigns.length} scheduled campaigns`,
      results
    })
  } catch (err: any) {
    console.error('Scheduled campaigns error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
