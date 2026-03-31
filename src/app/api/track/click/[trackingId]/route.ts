import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trackingId: string }> }
) {
  const { trackingId } = await params
  const supabase = await createClientAction()

  try {
    // Find the tracking link
    const { data: link, error: linkError } = await supabase
      .from('tracking_links')
      .select('id, original_url, campaign_recipient_id')
      .eq('tracking_id', trackingId)
      .single()

    if (linkError || !link) {
      return NextResponse.json({ error: 'Link not found' }, { status: 404 })
    }

    // Update click count and timestamp
    await supabase
      .from('tracking_links')
      .update({
        click_count: supabase.raw('click_count + 1'),
        clicked_at: new Date().toISOString(),
      })
      .eq('id', link.id)

    // Also update campaign_recipient status to 'clicked' if not already
    await supabase
      .from('campaign_recipients')
      .update({ status: 'clicked', clicked_at: new Date().toISOString() })
      .eq('id', link.campaign_recipient_id)
      .is('clicked_at', null) // only if not already clicked

    // Redirect to original URL
    return NextResponse.redirect(link.original_url)
  } catch (err: any) {
    console.error('Click tracking error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
