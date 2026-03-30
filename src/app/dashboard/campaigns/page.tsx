'use client'

import { useEffect, useState } from 'react'
import CampaignTable from '@/components/campaign-table'
import CampaignBuilder from '@/components/campaign-builder'
import { createClient } from '@/lib/supabase/browser-client'

export default function CampaignsPage() {
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
        .select('*, templates(name, subject)')
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
    if (!confirm('Are you sure you want to delete this campaign?')) return

    const { error } = await supabase.from('campaigns').delete().eq('id', id)
    if (error) {
      alert('Error deleting campaign: ' + error.message)
    } else {
      fetchCampaigns()
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
          <h1 className="text-3xl font-bold text-gray-900">Campaigns</h1>
          <p className="mt-2 text-gray-600">Create and send email campaigns</p>
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
