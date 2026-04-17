import { createClient } from '@/lib/supabase/browser-client'

export interface ContactFilter {
  tags?: string[]
  status?: 'active' | 'unsubscribed' | 'bounced'
  email?: string
  dateRange?: {
    from?: string
    to?: string
  }
}

export interface ContactCountResult {
  total: number
  filtered: number
}

/**
 * Get contact count with filters applied
 */
export async function getContactCount(
  userId: string,
  filter: ContactFilter = {}
): Promise<ContactCountResult> {
  const supabase = createClient()

  let query = supabase
    .from('contacts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  // Apply filters
  if (filter.status) {
    query = query.eq('status', filter.status)
  }

  if (filter.email) {
    query = query.ilike('email', `%${filter.email}%`)
  }

  if (filter.tags && filter.tags.length > 0) {
    // Use array overlap to find contacts that have ANY of the specified tags
    query = query.overlaps('tags', filter.tags)
  }

  const total = await query

  // Apply additional date range filter if provided
  if (filter.dateRange && (filter.dateRange.from || filter.dateRange.to)) {
    query = query.gte('created_at', filter.dateRange.from || '1970-01-01')
    query = query.lte('created_at', filter.dateRange.to || '2099-12-31')
  }

  const filtered = await query

  return {
    total: total.count || 0,
    filtered: filtered.count || 0
  }
}

/**
 * Get contacts with tag-based filtering
 */
export async function getContactsByTag(
  userId: string,
  tags: string[],
  page: number = 1,
  pageSize: number = 10
) {
  const supabase = createClient()

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('user_id', userId)
    .overlaps('tags', tags)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw new Error(`Error fetching contacts: ${error.message}`)
  }

  return data
}

/**
 * Get active contacts for a campaign based on its criteria
 */
export async function getCampaignContacts(
  userId: string,
  recipientCriteria?: any
) {
  const supabase = createClient()

  if (!recipientCriteria || Object.keys(recipientCriteria).length === 0) {
    // Return all active contacts if no criteria
    const { data } = await supabase
      .from('contacts')
      .select('id, email, first_name, last_name, company, tags')
      .eq('user_id', userId)
      .eq('status', 'active')

    return data || []
  }

  let query = supabase
    .from('contacts')
    .select('id, email, first_name, last_name, company, tags')
    .eq('user_id', userId)
    .eq('status', 'active')

  // Apply tag filters
  if (recipientCriteria.tags && Array.isArray(recipientCriteria.tags)) {
    query = query.overlaps('tags', recipientCriteria.tags)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Error fetching campaign contacts: ${error.message}`)
  }

  return data || []
}

/**
 * Check if a contact has specific tags
 */
export function contactHasTag(contact: any, tagName: string): boolean {
  if (!contact.tags || !Array.isArray(contact.tags)) {
    return false
  }
  return contact.tags.includes(tagName)
}

/**
 * Format tag display
 */
export function formatTagList(tags: string[]): string {
  if (!tags || tags.length === 0) {
    return 'No tags'
  }
  return tags.map(tag => `#${tag}`).join(', ')
}