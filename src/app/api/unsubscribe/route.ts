import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function POST(
  request: NextRequest
) {
  const supabase = await createClientAction()

  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Normalize email (lowercase, trim)
    const normalizedEmail = email.toLowerCase().trim()

    // Check if contact exists
    const { data: contact, error: fetchError } = await supabase
      .from('contacts')
      .select('id, email, status, unsubscribed_at')
      .eq('email', normalizedEmail)
      .single()

    if (fetchError || !contact) {
      // Contact not found - create a new record as unsubscribed
      await supabase
        .from('contacts')
        .insert({
          email: normalizedEmail,
          status: 'unsubscribed',
          unsubscribed_at: new Date().toISOString(),
        })

      return NextResponse.json({
        success: true,
        message: 'Email unsubscribed successfully',
        created: true,
      })
    }

    // Check if already unsubscribed
    if (contact.status === 'unsubscribed') {
      return NextResponse.json({
        success: true,
        message: 'Email is already unsubscribed',
        already_unsubscribed: true,
      })
    }

    // Update contact status
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        status: 'unsubscribed',
        unsubscribed_at: new Date().toISOString(),
      })
      .eq('id', contact.id)

    if (updateError) {
      console.error('Failed to unsubscribe contact:', updateError)
      return NextResponse.json(
        { error: 'Failed to unsubscribe email' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Email unsubscribed successfully',
    })
  } catch (err) {
    console.error('Unsubscribe by email error:', err)
    return NextResponse.json(
      { error: 'Failed to unsubscribe email' },
      { status: 500 }
    )
  }
}
