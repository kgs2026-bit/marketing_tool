'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

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
}

export default function AnalyticsPage() {
  const [stats, setStats] = useState<CampaignStats[]>([])
  const [loading, setLoading] = useState(true)
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

      const statsWithMetrics = await Promise.all(
        (campaigns || []).map(async (campaign) => {
          // Get recipient stats
          const { count: total_sent } = await supabase
            .from('campaign_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)

          const { count: delivered } = await supabase
            .from('campaign_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'delivered')

          const { count: opened } = await supabase
            .from('campaign_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'opened')

          const { count: clicked } = await supabase
            .from('campaign_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'clicked')

          const { count: bounced } = await supabase
            .from('campaign_recipients')
            .select('*', { count: 'exact', head: true })
            .eq('campaign_id', campaign.id)
            .eq('status', 'bounced')

          return {
            campaign,
            total_sent: total_sent || 0,
            delivered: delivered || 0,
            opened: opened || 0,
            clicked: clicked || 0,
            bounced: bounced || 0,
          }
        })
      )

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
          {stats.map(({ campaign, total_sent, delivered, opened, clicked, bounced }) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
