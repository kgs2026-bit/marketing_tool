import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ recipientId: string }> }
) {
  const supabase = await createClientAction()
  const { recipientId } = await params

  // Update opened status if not already opened
  try {
    await supabase
      .from('campaign_recipients')
      .update({
        status: 'opened',
        opened_at: new Date().toISOString(),
      })
      .eq('id', recipientId)
      .is('opened_at', null) // only if not already opened
  } catch (err) {
    console.error('Open tracking error:', err)
  }

  // Return a 1x1 transparent GIF
  const gif = Buffer.from(
    'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
    'base64'
  )

  return new NextResponse(gif, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
