import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server-client'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createServerClient()

  try {
    // Check user authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Clear existing recipients
    await supabase
      .from('campaign_recipients')
      .delete()
      .eq('campaign_id', id)

    // Fetch contacts based on campaign criteria
    let contacts: any[] = []

    if (campaign.recipient_criteria && Object.keys(campaign.recipient_criteria).length > 0) {
      // Dynamic criteria-based selection
      const { data: filteredContacts, error: criteriaError } = await supabase
        .from('contacts')
        .select('id, email, first_name, last_name, company, tags')
        .eq('user_id', user.id)
        .eq('status', 'active')

      if (criteriaError) {
        throw new Error(`Error fetching contacts: ${criteriaError.message}`)
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
        .select('id, email, first_name, last_name, company, tags')
        .in('id', campaign.recipient_list)
        .eq('status', 'active')

      if (staticError) {
        throw new Error(`Error fetching contacts: ${staticError.message}`)
      }

      contacts = staticContacts
    }

    if (contacts.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No valid contacts found based on selection criteria',
        count: 0
      })
    }

    // Create new recipient records
    const recipientData = contacts.map((contact: any) => ({
      campaign_id: id,
      contact_id: contact.id,
      email: contact.email,
      status: 'pending',
    }))

    const { error: insertError } = await supabase
      .from('campaign_recipients')
      .insert(recipientData)

    if (insertError) {
      throw new Error(`Failed to create recipients: ${insertError.message}`)
    }

    return NextResponse.json({
      success: true,
      message: 'Recipients refreshed successfully',
      count: contacts.length
    })

  } catch (error: any) {
    console.error('Error refreshing recipients:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}