import { NextRequest, NextResponse } from 'next/server'
import { createClientAction } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClientAction()
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
  const supabase = await createClientAction()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()

  const { data, error } = await supabase
    .from('campaigns')
    .insert({
      user_id: user.id,
      name: body.name,
      template_id: body.template_id || null,
      subject: body.subject || null,
      content: body.content || null,
      html_content: body.html_content || null,
      recipient_list: body.recipient_list || [],
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
