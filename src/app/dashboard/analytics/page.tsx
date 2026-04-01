'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

interface Contact {
  first_name: string | null
  last_name: string | null
  company: string | null
}

interface Recipient {
  id: string
  campaign_id: string
  email: string
  status: string
  sent_at: string | null
  opened_at: string | null
  clicked_at: string | null
  bounced_at: string | null
  bounce_reason: string | null
  contact_id: string
  contacts: Contact | null // Joined contact data (table name is 'contacts')
}

interface CampaignStats {
  campaign: {
    id: string
    name: string
    status: string
    sent_at: string | null
  }
  total_sent: number
  delivered: number
  opened: number
  clicked: number
  bounced: number
  recipients: Recipient[] // Raw recipient data with contacts joined
}

const getStatusBadge = (status: string) => {
  const styles: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    sending: 'bg-yellow-100 text-yellow-800',
    sent: 'bg-green-100 text-green-800',
    cancelled: 'bg-red-100 text-red-800',
    delivered: 'bg-blue-50 text-blue-700',
    opened: 'bg-green-50 text-green-700',
    clicked: 'bg-purple-100 text-purple-800',
    bounced: 'bg-red-100 text-red-800',
  }
  return styles[status] || 'bg-gray-100 text-gray-800'
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<CampaignStats[]>([])
  const [loading, setLoading] = useState(true)
  // Pagination state per campaign (keyed by campaign ID)
  const [pageSizes, setPageSizes] = useState<Record<string, number>>({})
  const [currentPages, setCurrentPages] = useState<Record<string, number>>({})
  const supabase = createClient()

  useEffect(() => {
    fetchCampaignStats()
  }, [])

  const fetchCampaignStats = async () => {
    setLoading(true)
    try {
      // Get all sent campaigns
      const { data: campaigns, error } = await supabase
        .from('campaigns')
        .select('id, name, status, sent_at')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })

      if (error) throw error

      if (!campaigns || campaigns.length === 0) {
        setStats([])
        setLoading(false)
        return
      }

      // Fetch all campaign recipients for these campaigns in one query
      const campaignIds = campaigns.map(c => c.id)
      // Select with correct foreign key relationship: 'contacts' (table name) not 'contact'
      const { data: recipientsData, error: recipientsError } = await supabase
        .from('campaign_recipients')
        .select(`
          id,
          campaign_id,
          email,
          status,
          sent_at,
          opened_at,
          clicked_at,
          bounced_at,
          bounce_reason,
          contact_id,
          contacts (first_name, last_name, company)
        `)
        .in('campaign_id', campaignIds)

      if (recipientsError) {
        console.error('Error fetching recipients:', recipientsError)
      }

      // Debug: check what we got
      if (recipientsData && recipientsData.length > 0) {
        console.log('Raw recipientsData[0]:', {
          id: recipientsData[0].id,
          email: recipientsData[0].email,
          contact_id: recipientsData[0].contact_id,
          contacts: recipientsData[0].contacts
        })
      }
      console.log('All recipientsData count:', recipientsData?.length)

      // Group recipients by campaign_id - use raw data as-is
      const recipientsByCampaign: Record<string, any[]> = {}
      ;(recipientsData || []).forEach(rec => {
        if (!recipientsByCampaign[rec.campaign_id]) {
          recipientsByCampaign[rec.campaign_id] = []
        }
        recipientsByCampaign[rec.campaign_id].push(rec)
      })

      // Build stats with recipients
      const statsWithMetrics: CampaignStats[] = campaigns.map(campaign => {
        const recips = recipientsByCampaign[campaign.id] || []
        // Debug: check if recips have contacts
        if (recips.length > 0) {
          console.log('Campaign:', campaign.name, 'recipients sample:', {
            email: recips[0].email,
            contacts: recips[0].contacts,
            hasContacts: !!recips[0].contacts
          })
        }
        const total_sent = recips.length
        // Use sent_at timestamp to determine delivered (has been sent), regardless of current status
        const delivered = recips.filter(r => r.sent_at !== null).length
        // Opened is based on opened_at timestamp
        const opened = recips.filter(r => r.opened_at !== null).length
        // Clicked is based on clicked_at timestamp
        const clicked = recips.filter(r => r.clicked_at !== null).length
        // Bounced is still based on status (since bounce is a terminal state)
        const bounced = recips.filter(r => r.status === 'bounced').length

        return {
          campaign,
          total_sent,
          delivered,
          opened,
          clicked,
          bounced,
          recipients: recips,
        }
      })

      setStats(statsWithMetrics)
    } catch (error) {
      console.error('Error fetching analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateRate = (part: number, total: number) => {
    if (total === 0) return 0
    return ((part / total) * 100).toFixed(1)
  }

  const getPageSize = (campaignId: string) => pageSizes[campaignId] || 20
  const setPageSize = (campaignId: string, size: number) => {
    setPageSizes(prev => ({ ...prev, [campaignId]: size }))
    setCurrentPages(prev => ({ ...prev, [campaignId]: 1 }))
  }
  const getCurrentPage = (campaignId: string) => currentPages[campaignId] || 1
  const setCurrentPage = (campaignId: string, page: number) => {
    setCurrentPages(prev => ({ ...prev, [campaignId]: page }))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
        <p className="mt-2 text-gray-600">Track your email campaign performance</p>
      </div>

      {stats.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow text-center">
          <p className="text-gray-500 mb-4">No campaign data yet</p>
          <a href="/campaigns" className="text-blue-600 hover:text-blue-500">
            Create your first campaign →
          </a>
        </div>
      ) : (
        <div className="grid gap-6">
          {stats.map(({ campaign, total_sent, delivered, opened, clicked, bounced, recipients }) => (
            <div key={campaign.id} className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{campaign.name}</h3>
                  <p className="text-sm text-gray-500">
                    Sent: {campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                  {campaign.status}
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-gray-900">{total_sent}</div>
                  <div className="text-sm text-gray-600">Total Sent</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{delivered}</div>
                  <div className="text-sm text-blue-600">
                    Delivered ({calculateRate(delivered, total_sent)}%)
                  </div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{opened}</div>
                  <div className="text-sm text-green-600">
                    Opened ({calculateRate(opened, delivered)}%)
                  </div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{clicked}</div>
                  <div className="text-sm text-purple-600">
                    Clicked ({calculateRate(clicked, opened)}%)
                  </div>
                </div>
                <div className="text-center p-4 bg-red-50 rounded-lg">
                  <div className="text-2xl font-bold text-red-600">{bounced}</div>
                  <div className="text-sm text-red-600">
                    Bounced ({calculateRate(bounced, total_sent)}%)
                  </div>
                </div>
              </div>

              {/* Recipients Table */}
              <div className="mt-6 border-t pt-4">
                <div className="flex justify-between items-center mb-3">
                  <h4 className="font-medium text-gray-900">Recipients ({recipients.length})</h4>
                  <select
                    value={getPageSize(campaign.id)}
                    onChange={(e) => setPageSize(campaign.id, parseInt(e.target.value))}
                    className="px-2 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 shadow-sm"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sent</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opened</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clicked</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bounced</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {(() => {
                        const pageSize = getPageSize(campaign.id)
                        const currentPage = getCurrentPage(campaign.id)
                        const totalPages = Math.ceil(recipients.length / pageSize)
                        const start = (currentPage - 1) * pageSize
                        const end = start + pageSize
                        const pageRecipients = recipients.slice(start, end)

                        return pageRecipients.map((rec: Recipient) => {
                          const contact = rec.contacts
                          const fullName = contact ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() : '-'
                          return (
                            <tr key={rec.id}>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                {fullName}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">{rec.email}</td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(rec.status)}`}>
                                  {rec.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {rec.sent_at ? new Date(rec.sent_at).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {rec.opened_at ? new Date(rec.opened_at).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                {rec.clicked_at ? new Date(rec.clicked_at).toLocaleString() : '-'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600">
                                {rec.bounce_reason || (rec.bounced_at ? 'Bounced' : '-')}
                              </td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Pagination controls */}
                {recipients.length > getPageSize(campaign.id) && (() => {
                  const pageSize = getPageSize(campaign.id)
                  const currentPage = getCurrentPage(campaign.id)
                  const totalPages = Math.ceil(recipients.length / pageSize)

                  return (
                    <div className="flex items-center justify-between mt-3">
                      <div className="text-sm text-gray-600">
                        Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, recipients.length)} of {recipients.length} recipients
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => setCurrentPage(campaign.id, Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                          className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 shadow-sm transition-colors"
                        >
                          Previous
                        </button>
                        <div className="flex items-center space-x-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum
                            if (totalPages <= 5) {
                              pageNum = i + 1
                            } else if (currentPage <= 3) {
                              pageNum = i + 1
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i
                            } else {
                              pageNum = currentPage - 2 + i
                            }

                            return (
                              <button
                                key={pageNum}
                                onClick={() => setCurrentPage(campaign.id, pageNum)}
                                className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                                  currentPage === pageNum
                                    ? 'bg-blue-600 text-white shadow-md'
                                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            )
                          })}
                        </div>
                        <button
                          onClick={() => setCurrentPage(campaign.id, Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                          className="px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 shadow-sm transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
