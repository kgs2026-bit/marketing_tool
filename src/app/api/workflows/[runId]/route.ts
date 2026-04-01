import { NextRequest, NextResponse } from 'next/server'
import { getRun } from 'workflow/api'
import { createClientAction } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params
  const supabase = await createClientAction()

  try {
    // Get workflow run status
    const run = getRun(runId)

    // Fetch campaign context if available
    // Workflow arguments: [campaignId]
    const campaignId = run.args?.[0] as string | undefined

    let campaignInfo = null
    if (campaignId) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('id, name, status, sent_at')
        .eq('id', campaignId)
        .single()
      campaignInfo = campaign
    }

    // Get recent events from default stream (progress updates)
    const readable = run.getReadable()
    const events: any[] = []

    // Consume available events (non-blocking)
    while (true) {
      const event = await readable.read()
      if (event.done) break
      events.push(event.value)
    }

    // Determine overall status
    let status = 'running'
    if (run.returnValue !== undefined) {
      status = 'completed'
    } else if (run.failed) {
      status = 'failed'
    } else if (run.stopped) {
      status = 'stopped'
    }

    return NextResponse.json({
      runId,
      status,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
      campaign: campaignInfo,
      events: events.slice(-10), // last 10 events
      eventCount: events.length,
      hasReturnValue: run.returnValue !== undefined,
    })
  } catch (err: any) {
    console.error('Workflow status error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
