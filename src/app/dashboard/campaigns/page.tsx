'use client'

import { useEffect, useState } from 'react'
import CampaignTable from '@/components/campaign-table'
import CampaignBuilder from '@/components/campaign-builder'
import { createClient } from '@/lib/supabase/browser-client'
import { useToast } from '@/components/toast'
import { useConfirmation } from '@/components/confirmation-provider'

export default function CampaignsPage() {
  const { addToast } = useToast()
  const { confirm } = useConfirmation()
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isBuilderOpen, setIsBuilderOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<any>(null)
  const supabase = createClient()

  const fetchCampaigns = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('campaigns')
        .select('*, templates(name, subject), sender_name')
        .order('created_at', { ascending: false })

      if (error) throw error
      setCampaigns(data || [])
    } catch (error) {
      console.error('Error fetching campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [])

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Campaign',
      message: 'Are you sure you want to delete this campaign? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      type: 'danger',
    })
    if (!confirmed) return

    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) {
      addToast({ message: 'Error deleting campaign: ' + error.message, type: 'error' })
    } else {
      fetchCampaigns()
      addToast({ message: 'Campaign deleted successfully', type: 'success' })
    }
  }

  const handleEdit = (campaign: any) => {
    setEditingCampaign(campaign)
    setIsBuilderOpen(true)
  }

  const handleCloseBuilder = () => {
    setIsBuilderOpen(false)
    setEditingCampaign(null)
  }

  const handleSave = () => {
    handleCloseBuilder()
    fetchCampaigns()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Create and send email campaigns</p>
        </div>
        <button
          onClick={() => setIsBuilderOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Create Campaign
        </button>
      </div>

      <CampaignTable campaigns={campaigns} loading={loading} onEdit={handleEdit} onDelete={handleDelete} />

      <CampaignBuilder
        isOpen={isBuilderOpen}
        onClose={handleCloseBuilder}
        onSave={handleSave}
        campaign={editingCampaign}
      />
    </div>
  )
}
