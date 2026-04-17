import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { start } from 'workflow/api'
import { sendCampaignWorkflow } from '@/workflows/campaign-send.workflow'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

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

    // Create campaign_recipients based on campaign criteria
    let contacts: any[] = []
    let recipientData: any[] = []

    if (campaign.recipient_criteria && Object.keys(campaign.recipient_criteria).length > 0) {
      // Dynamic criteria-based selection
      const { data: filteredContacts, error: criteriaError } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, company')
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (criteriaError) {
        console.error('Error fetching contacts by criteria:', criteriaError)
        return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
      }

      // Apply tag filter if specified
      if (campaign.recipient_criteria.tags && Array.isArray(campaign.recipient_criteria.tags)) {
        contacts = filteredContacts.filter((contact: any) =>
          campaign.recipient_criteria.tags.some((tag: string) =>
            contact.tags && contact.tags.includes(tag)
          )
        )
      } else {
        contacts = filteredContacts
      }
    } else if (campaign.recipient_list && campaign.recipient_list.length > 0) {
      // Static ID-based selection
      const { data: staticContacts, error: staticError } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, company')
        .in('id', campaign.recipient_list)
        .eq('status', 'active')

      if (staticError) {
        console.error('Error fetching contacts by IDs:', staticError)
        return NextResponse.json({ error: 'Failed to fetch contacts' }, { status: 500 })
      }

      contacts = staticContacts
    }

    if (contacts.length === 0) {
      return NextResponse.json(
        { error: 'No valid contacts found based on selection criteria' },
        { status: 400 }
      )
    }

    // Create recipient records
    recipientData = contacts.map((contact: any) => ({
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

    // Verify campaign still exists and we have recipient data before starting workflow
    if (!campaign.recipient_list || campaign.recipient_list.length === 0) {
      return NextResponse.json(
        { error: 'Campaign has no recipients. Please add contacts first.' },
        { status: 400 }
      )
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
      return NextResponse.json({ error: 'Failed to update campaign status' }, { status: 500 })
    }

    // Double-check the campaign still exists in DB (debug logging)
    console.log('[Send] Starting workflow for campaign:', {
      campaignId: id,
      campaignName: campaign.name,
      recipientCount: campaign.recipient_list.length,
      userEmail: user.email,
    })

    // Start the workflow (runs in background, no timeout)
    const run = await start(sendCampaignWorkflow, [id])

    // Store workflow run ID for tracking
    await supabase
      .from('campaigns')
      .update({ workflow_run_id: run.runId })
      .eq('id', campaign.id)

    console.log('[Send] Workflow started:', { runId: run.runId, campaignId: id })

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
