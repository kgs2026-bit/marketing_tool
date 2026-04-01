'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import Link from 'next/link'

interface Campaign {
  id: string
  name: string
  status: string
  sent_at: string | null
  created_at: string
  recipient_count?: number
}

export default function RecentCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchCampaigns = async () => {
      try {
        const { data, error } = await supabase
          .from('campaigns')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5)

        if (error) throw error
        setCampaigns(data || [])
      } catch (error) {
        console.error('Error fetching campaigns:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCampaigns()
  }, [supabase])

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
      scheduled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400',
      sending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400',
      sent: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400',
      cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400',
    }
    return styles[status] || 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
  }

  if (loading) {
    return (
      <div className="bg-background dark:bg-card shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-foreground mb-4">Recent Campaigns</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background dark:bg-card shadow rounded-lg p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-medium text-foreground">Recent Campaigns</h2>
        <Link href="/campaigns" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-sm">
          View all →
        </Link>
      </div>
      {campaigns.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400 mb-4">No campaigns yet</p>
          <Link
            href="/campaigns/new"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            Create your first campaign
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border dark:divide-gray-700">
            <thead className="bg-muted dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Created
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sent
                </th>
              </tr>
            </thead>
            <tbody className="bg-background dark:bg-card divide-y divide-border dark:divide-gray-700">
              {campaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Link
                      href={`/campaigns/${campaign.id}`}
                      className="text-sm font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {campaign.name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadge(
                        campaign.status
                      )}`}
                    >
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(campaign.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
