import { NextRequest, NextResponse } from 'next/server'
import { getRun, type Run } from 'workflow/api'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const { runId } = await params

  try {
    // Get workflow run status
    const run = getRun(runId) as Run<any>

    // Get recent events from default stream (progress updates)
    const readable = run.getReadable()
    const events: any[] = []

    // Consume available events using Web Streams API
    const reader = readable.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        events.push(value)
      }
    } finally {
      reader.releaseLock()
    }

    // Determine overall status based on return value
    let status = 'running'
    if (run.returnValue !== undefined) {
      status = 'completed'
    }

    return NextResponse.json({
      runId,
      status,
      events: events.slice(-10), // last 10 events
      eventCount: events.length,
      hasReturnValue: run.returnValue !== undefined,
    } as any)
  } catch (err: any) {
    console.error('Workflow status error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
