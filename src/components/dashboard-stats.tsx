'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

interface Stats {
  totalContacts: number
  totalCampaigns: number
  campaignsSent: number
  totalEmailsDelivered: number
}

export default function DashboardStats() {
  const [stats, setStats] = useState<Stats>({
    totalContacts: 0,
    totalCampaigns: 0,
    campaignsSent: 0,
    totalEmailsDelivered: 0,
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Get total contacts
        const { count: contactsCount } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })

        // Get campaigns stats
        const { count: campaignsCount } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })

        const { count: sentCampaigns } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'sent')

        // Get delivered emails
        const { count: deliveredCount } = await supabase
          .from('campaign_recipients')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'delivered')

        setStats({
          totalContacts: contactsCount || 0,
          totalCampaigns: campaignsCount || 0,
          campaignsSent: sentCampaigns || 0,
          totalEmailsDelivered: deliveredCount || 0,
        })
      } catch (error) {
        console.error('Error fetching stats:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [supabase])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white p-6 rounded-lg shadow animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
            <div className="h-8 bg-gray-200 rounded w-3/4"></div>
          </div>
        ))}
      </div>
    )
  }

  const statItems = [
    { label: 'Total Contacts', value: stats.totalContacts, icon: '👥' },
    { label: 'Total Campaigns', value: stats.totalCampaigns, icon: '📧' },
    { label: 'Campaigns Sent', value: stats.campaignsSent, icon: '🚀' },
    { label: 'Emails Delivered', value: stats.totalEmailsDelivered, icon: '✅' },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {statItems.map((item) => (
        <div key={item.label} className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">{item.label}</p>
              <p className="text-3xl font-bold text-gray-900 mt-2">{item.value}</p>
            </div>
            <span className="text-4xl">{item.icon}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
