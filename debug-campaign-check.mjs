import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://acwwxlneuqcpqdntdbnj.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFjd3d4bG5ldXFjcHFkbnRkYm5qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDg1MTk3NSwiZXhwIjoyMDkwNDI3OTc1fQ.O18MN4gfDuHl6gtzUXkHo8hcH9qx8FZ0pChIcPb2I-c'

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkCampaign() {
  const campaignId = '6c36fd41-a21a-469f-87c6-53a991fbaf05'

  console.log('Checking campaign with service role key...')
  const { data, error } = await supabase
    .from('campaigns')
    .select('*, campaign_recipients(*)')
    .eq('id', campaignId)
    .single()

  if (error) {
    console.error('Error fetching campaign:', error)
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint
    })
  } else {
    console.log('Campaign found:', JSON.stringify(data, null, 2))
  }
}

checkCampaign()
