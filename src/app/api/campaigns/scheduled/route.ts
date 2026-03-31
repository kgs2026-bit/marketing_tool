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
    // Find campaigns that are scheduled and scheduled_at <= now
    const { data: dueCampaigns, error } = await supabase
      .from('campaigns')
      .select('id, user_id')
      .eq('status', 'scheduled')
      .lte('scheduled_at', new Date().toISOString())

    if (error) throw error

    if (!dueCampaigns || dueCampaigns.length === 0) {
      return NextResponse.json({ message: 'No scheduled campaigns to send' })
    }

    // Mark all due campaigns as 'sending' to prevent duplicate sends
    const campaignIds = dueCampaigns.map(c => c.id)
    await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .in('id', campaignIds)

    const results = []

    for (const campaign of dueCampaigns) {
      try {
        // Call the existing send endpoint for each campaign with cron secret
        const response = await fetch(`${request.nextUrl.origin}/api/campaigns/${campaign.id}/send`, {
          method: 'POST',
          headers: {
            'x-cron-secret': process.env.CRON_SECRET || ''
          }
        })

        if (response.ok) {
          results.push({ campaignId: campaign.id, status: 'sent' })
        } else {
          // If send fails, revert status back to scheduled
          await supabase
            .from('campaigns')
            .update({ status: 'scheduled' })
            .eq('id', campaign.id)
          results.push({ campaignId: campaign.id, status: 'failed', error: await response.text() })
        }
      } catch (err: any) {
        await supabase
          .from('campaigns')
          .update({ status: 'scheduled' })
          .eq('id', campaign.id)
        results.push({ campaignId: campaign.id, status: 'error', error: err.message })
      }
    }

    return NextResponse.json({
      message: `Processed ${dueCampaigns.length} scheduled campaigns`,
      results
    })
  } catch (err: any) {
    console.error('Scheduled campaigns error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
