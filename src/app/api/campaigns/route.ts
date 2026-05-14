import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server-client'

export async function GET(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('campaigns')
    .select('*, templates(name, subject)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  // Prepare recipient criteria
  let recipientList = []
  let recipientCriteria = {}

  if (body.recipient_ids && Array.isArray(body.recipient_ids)) {
    recipientList = body.recipient_ids
  }

  // If tag filter was used, store criteria
  if (body.tag_filter && Array.isArray(body.tag_filter) && body.tag_filter.length > 0) {
    recipientCriteria = {
      tags: body.tag_filter,
      filter_mode: 'tag',
      created_at: new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      name: body.name,
      template_id: body.template_id || null,
      subject: body.subject || null,
      content: body.content || null,
      html_content: body.html_content || null,
      recipient_list: recipientList,
      recipient_criteria: recipientCriteria,
      scheduled_at: body.scheduled_at || null,
      status: body.scheduled_at ? 'scheduled' : 'draft',
      email_provider: body.email_provider || 'resend',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data }, { status: 201 })
}
