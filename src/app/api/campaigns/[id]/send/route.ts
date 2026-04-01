import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'
import { start } from 'workflow/api'
import { sendCampaignWorkflow } from '@/workflows/campaign-send.workflow'

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
    // Verify campaign belongs to user
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Check if campaign is in draft status
    if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
      return NextResponse.json(
        { error: `Campaign cannot be sent (current status: ${campaign.status})` },
        { status: 400 }
      )
    }

    // If no recipients, create them from recipient_list (contact IDs)
    if (!campaign.recipient_list || campaign.recipient_list.length === 0) {
      return NextResponse.json({ error: 'No recipients specified' }, { status: 400 })
    }

    // Create campaign_recipients from contact IDs
    const contactIds = campaign.recipient_list

    const { data: contacts, error: contactsError } = await supabase
      .from('contacts')
      .select('id, email')
      .in('id', contactIds)
      .neq('status', 'unsubscribed')

    if (contactsError) {
      console.error('Error fetching contacts:', contactsError)
      return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
    }

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'All contacts have unsubscribed or no valid contacts found' },
        { status: 400 }
      )
    }

    // Create recipient records
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
      return NextResponse.json({ error: 'Failed to create recipients' }, { status: 500 })
    }

    // Update campaign status to sending
    const { data: updatedCampaign, error: updateError } = await supabase
      .from('campaigns')
      .update({ status: 'sending' })
      .eq('id', campaign.id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating campaign status:', updateError)
    }

    // Start the workflow (runs in background, no timeout)
    const run = await start(sendCampaignWorkflow, [id])

    // Store workflow run ID for tracking
    await supabase
      .from('campaigns')
      .update({ workflow_run_id: run.runId })
      .eq('id', campaign.id)

    return NextResponse.json({
      success: true,
      message: 'Campaign sending started',
      runId: run.runId,
      campaignId: id,
    })
  } catch (err: any) {
    console.error('Campaign send error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
