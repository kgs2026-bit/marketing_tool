'use client'

interface Campaign {
  id: string
  name: string
  status: string
  sent_at: string | null
  scheduled_at: string | null
  created_at: string
  templates: { name: string; subject: string } | null
}

interface CampaignTableProps {
  campaigns: Campaign[]
  loading: boolean
  onEdit: (campaign: Campaign) => void
  onDelete: (id: string) => void
}

export default function CampaignTable({ campaigns, loading, onEdit, onDelete }: CampaignTableProps) {
  if (loading) {
    return (
      <div className="bg-card shadow rounded-lg overflow-hidden">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 dark:bg-gray-800"></div>
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 border-t border-border dark:border-gray-700"></div>
          ))}
        </div>
      </div>
    )
  }

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

  return (
    <div className="bg-card shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border dark:divide-gray-700">
          <thead className="bg-muted dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Template
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Sent
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Scheduled
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border dark:divide-gray-700">
            {campaigns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  No campaigns yet. Create your first campaign!
                </td>
              </tr>
            ) : (
              campaigns.map((campaign) => (
                <tr key={campaign.id} className="hover:bg-muted dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">{campaign.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {campaign.templates?.name || 'Custom'}
                    </div>
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
                    {campaign.sent_at ? new Date(campaign.sent_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {campaign.scheduled_at ? new Date(campaign.scheduled_at).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => onEdit(campaign)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(campaign.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
