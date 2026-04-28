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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [authLoading, setAuthLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      try {
        console.log('[CampaignsPage] Checking auth session...')
        const { data: { session }, error } = await supabase.auth.getSession()

        if (error) {
          console.error('Auth check error:', error)
        } else {
          console.log('[CampaignsPage] Session found:', session)
          setIsAuthenticated(!!session)
        }
      } catch (err) {
        console.error('Auth check failed:', err)
      } finally {
        setAuthLoading(false)
      }
    }

    checkAuth()
  }, [supabase])

  const fetchCampaigns = async () => {
    if (!isAuthenticated) {
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      console.log('[CampaignsPage] Fetching campaigns...')
      const { data, error } = await supabase
        .from('campaigns')
        .select('*, templates(name, subject), sender_name')
        .order('created_at', { ascending: false })

      if (error) throw error
      console.log('[CampaignsPage] Campaigns fetched:', data)
      setCampaigns(data || [])
    } catch (error) {
      console.error('Error fetching campaigns:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAuthenticated) {
      fetchCampaigns()
    }
  }, [isAuthenticated])

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

  if (authLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Create and send email campaigns</p>
          </div>
        </div>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-200 dark:bg-gray-800 rounded"></div>
          ))}
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Campaigns</h1>
            <p className="mt-2 text-gray-600 dark:text-gray-400">Create and send email campaigns</p>
          </div>
        </div>
        <div className="bg-card p-6 rounded-lg shadow">
          <p className="text-center text-gray-500 dark:text-gray-400">
            Please log in to view your campaigns.
          </p>
        </div>
      </div>
    )
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
