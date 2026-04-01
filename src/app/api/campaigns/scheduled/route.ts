import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'
import { start } from 'workflow/api'
import { sendCampaignWorkflow } from '@/workflows/campaign-send.workflow'

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
    const { data: dueCampaigns, error } = await supabase
      .from('campaigns')
      .select('id, user_id, scheduled_at, name')
      .eq('status', 'scheduled')
      .lte('scheduled_at', now)

    if (error) throw error

    if (!dueCampaigns || dueCampaigns.length === 0) {
      console.log('[Scheduled] No campaigns due for sending')
      return NextResponse.json({ message: 'No scheduled campaigns to send' })
    }

    console.log(`[Scheduled] Found ${dueCampaigns.length} campaign(s) due`)

    // Mark all due campaigns as 'sending' and start workflows
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

    // Start a workflow for each campaign (fire-and-forget)
    const results = []
    for (const campaign of dueCampaigns) {
      console.log(`[Scheduled] Starting workflow for campaign ${campaign.id}...`)
      try {
        const run = await start(sendCampaignWorkflow, [campaign.id])
        results.push({ campaignId: campaign.id, status: 'started', runId: run.runId })
      } catch (err: any) {
        console.error(`[Scheduled] Failed to start workflow for campaign ${campaign.id}:`, err.message)
        // Revert status back to scheduled on error
        await supabase
          .from('campaigns')
          .update({ status: 'scheduled' })
          .eq('id', campaign.id)
        results.push({ campaignId: campaign.id, status: 'failed', error: err.message })
      }
    }

    console.log(`[Scheduled] Completed. Results:`, results)
    return NextResponse.json({
      message: `Started ${dueCampaigns.length} scheduled campaign(s)`,
      results
    })
  } catch (err: any) {
    console.error('Scheduled campaigns error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
