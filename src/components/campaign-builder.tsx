'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { useToast } from '@/components/toast'

// Helper to format UTC date for datetime-local input (convert to local time)
const formatDateTimeLocal = (utcString: string) => {
  const date = new Date(utcString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

interface CampaignBuilderProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  campaign: any | null
}

export default function CampaignBuilder({ isOpen, onClose, onSave, campaign }: CampaignBuilderProps) {
  const supabase = createClient()
  const { addToast } = useToast()
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<any[]>([])
  const [paginatedContacts, setPaginatedContacts] = useState<any[]>([]) // Contacts for current page
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [senderEmail, setSenderEmail] = useState<string>('')
  const [senderName, setSenderName] = useState<string>('')
  const [defaultSenderName, setDefaultSenderName] = useState<string>('')
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [totalContacts, setTotalContacts] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    subject: '',
    content: '',
    html_content: '',
    recipient_ids: [] as string[],
    scheduled_at: '',
    email_provider: 'resend' as 'resend' | 'gmail',
    sender_name: '',
  })

  useEffect(() => {
    if (isOpen) {
      if (campaign) {
        // Load campaign data, convert scheduled_at from UTC to local for input
        setFormData({
          name: campaign.name || '',
          template_id: campaign.template_id || '',
          subject: campaign.subject || '',
          content: campaign.content || '',
          html_content: campaign.html_content || '',
          recipient_ids: campaign.recipient_list || [],
          scheduled_at: campaign.scheduled_at ? formatDateTimeLocal(campaign.scheduled_at) : '',
          email_provider: campaign.email_provider || 'resend',
          sender_name: campaign.sender_name || '',
        })
        setStep(3) // go to review step
      } else {
        setFormData({
          name: '',
          template_id: '',
          subject: '',
          content: '',
          html_content: '',
          recipient_ids: [],
          scheduled_at: '',
          email_provider: 'resend',
          sender_name: defaultSenderName || senderName,
        })
        setStep(1)
      }
      loadTemplates()
      loadContacts(1, pageSize) // Reset to page 1 when opening
      loadSenderInfo()
      loadDefaultSenderName()
    }
  }, [isOpen, campaign, pageSize])

  const loadSenderInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setSenderEmail(user.email || '')
        const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || 'User'
        setSenderName(name)
      }
    } catch (error) {
      console.error('Error loading sender info:', error)
    }
  }

  const loadDefaultSenderName = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('user_email_configs')
        .select('default_sender_name')
        .eq('user_id', user.id)
        .eq('provider', 'resend')
        .single()

      if (data?.default_sender_name) {
        setDefaultSenderName(data.default_sender_name)
      }
    } catch (error) {
      console.error('Error loading default sender name:', error)
    }
  }

  // Get the verified from email from env (available on client due to NEXT_PUBLIC_)
  const verifiedFromEmail = process.env.NEXT_PUBLIC_RESEND_FROM_EMAIL || 'onboarding@resend.dev'

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setTemplates([])
        return
      }
      const { data } = await supabase.from('templates').select('*').eq('user_id', user.id)
      setTemplates(data || [])
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const loadContacts = async (page: number = currentPage, size: number = pageSize) => {
    setLoadingContacts(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setPaginatedContacts([])
        setTotalContacts(0)
        setTotalPages(0)
        return
      }

      // Get total count for pagination
      const { count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('status', 'active')

      const total = count || 0
      setTotalContacts(total)
      setTotalPages(Math.ceil(total / size))

      // Get paginated contacts
      const from = (page - 1) * size
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .range(from, from + size - 1)

      setPaginatedContacts(data || [])
      setCurrentPage(page)
    } catch (error) {
      console.error('Error loading contacts:', error)
    } finally {
      setLoadingContacts(false)
    }
  }

  const handleTemplateSelect = async (templateId: string) => {
    const template = templates.find((t) => t.id === templateId)
    if (template) {
      setFormData({
        ...formData,
        template_id: templateId,
        subject: template.subject,
        html_content: template.html_content,
        content: template.content,
      })
    }
    setStep(2)
  }

  const handleContactToggle = (contactId: string) => {
    setFormData((prev) => ({
      ...prev,
      recipient_ids: prev.recipient_ids.includes(contactId)
        ? prev.recipient_ids.filter((id) => id !== contactId)
        : [...prev.recipient_ids, contactId],
    }))
  }

  const handleSelectAllOnPage = () => {
    setFormData((prev) => {
      const currentPageIds = paginatedContacts.map((c) => c.id)
      const allSelected = currentPageIds.every((id) => prev.recipient_ids.includes(id))

      if (allSelected) {
        // Deselect all on this page
        return {
          ...prev,
          recipient_ids: prev.recipient_ids.filter((id) => !currentPageIds.includes(id)),
        }
      } else {
        // Select all on this page (avoid duplicates)
        const newSelection = new Set([...prev.recipient_ids, ...currentPageIds])
        return {
          ...prev,
          recipient_ids: Array.from(newSelection),
        }
      }
    })
  }

  const goToPage = (page: number) => {
    const validPage = Math.max(1, Math.min(page, totalPages))
    loadContacts(validPage, pageSize)
  }

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value)
    setPageSize(newSize)
    setCurrentPage(1) // Reset to page 1, effect will reload
  }

  // Calculate how many contacts on current page are selected
  const selectedOnPageCount = paginatedContacts.filter((c) =>
    formData.recipient_ids.includes(c.id)
  ).length

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (formData.recipient_ids.length === 0) {
        throw new Error('Please select at least one recipient')
      }

      // Get current user for RLS
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      const campaignData = {
        user_id: user.id,
        name: formData.name,
        template_id: formData.template_id || null,
        subject: formData.subject || null,
        content: formData.content || null,
        html_content: formData.html_content || null,
        recipient_list: formData.recipient_ids,
        scheduled_at: formData.scheduled_at ? new Date(formData.scheduled_at).toISOString() : null,
        status: formData.scheduled_at ? 'scheduled' : 'draft',
        email_provider: formData.email_provider,
        sender_name: formData.sender_name || null,
      }

      if (campaign) {
        // Update existing campaign - include user_id check for RLS
        const { error } = await supabase
          .from('campaigns')
          .update(campaignData)
          .eq('id', campaign.id)
          .eq('user_id', user.id)
        if (error) throw error
      } else {
        // Create new campaign
        const { error } = await supabase.from('campaigns').insert(campaignData)
        if (error) throw error
      }

      onSave()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSendNow = async () => {
    // First save the campaign (if not existing)
    if (!campaign) {
      await handleSubmit()
      // Then find the newly created campaign and send it
      // For simplicity, we'll just create and then send
      const { data } = await supabase
        .from('campaigns')
        .select('id')
        .eq('name', formData.name)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      if (data) {
        await sendCampaign(data.id)
      }
    } else {
      await sendCampaign(campaign.id)
    }
  }

  const sendCampaign = async (campaignId: string) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send campaign')
      }

      if (result.failed > 0) {
        const errorList = result.errors?.map((e: any) => `${e.email}: ${e.error}`).join('\n') || 'Unknown errors'
        addToast({ message: `Campaign sent with ${result.sent} successful and ${result.failed} failed deliveries. Failures: ${errorList}`, type: 'warning', duration: 10000 })
      } else {
        addToast({ message: 'Campaign sent successfully to all recipients!', type: 'success' })
      }
      onSave()
    } catch (err: any) {
      addToast({ message: 'Campaign failed: ' + err.message, type: 'error', duration: 10000 })
      console.error(err)
      setError(err.message)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto flex items-start justify-center py-8 z-50">
      <div className="relative w-full max-w-4xl mx-auto p-5 bg-background dark:bg-card shadow-xl rounded-lg max-h-[90vh] overflow-y-auto text-foreground">
        <div className="flex justify-between items-center mb-6 sticky top-0 bg-background dark:bg-card pb-4">
          <h3 className="text-lg font-medium text-foreground">
            {campaign ? 'Edit Campaign' : 'Create Campaign'}
          </h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 text-2xl">
            ✕
          </button>
        </div>

        {/* Steps */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && <div className="w-20 h-1 mx-2 bg-gray-200 dark:bg-gray-700 rounded" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-600 dark:text-gray-400">
            <span>1. Choose Template</span>
            <span>2. Select Recipients</span>
            <span>3. Review & Send</span>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-md">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Step 1: Choose Template */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Campaign Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter campaign name"
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Template</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      !formData.template_id
                        ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30 shadow-md'
                        : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-muted dark:hover:bg-gray-800'
                    }`}
                    onClick={() => setFormData({ ...formData, template_id: '' })}
                  >
                    <div className="font-medium text-gray-900 dark:text-gray-100 text-base">Custom Email</div>
                    <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">Write your own content from scratch</div>
                  </div>
                  {loadingTemplates ? (
                    <div className="col-span-2 text-center py-8 text-gray-500 dark:text-gray-400">Loading templates...</div>
                  ) : (
                    templates.map((template) => (
                      <div
                        key={template.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                          formData.template_id === template.id
                            ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30 shadow-md'
                            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-muted dark:hover:bg-gray-800'
                        }`}
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <div className="font-medium text-gray-900 dark:text-gray-100 text-base">{template.name}</div>
                        <div className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">{template.subject}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {formData.template_id && (
                <div className="mt-4 p-4 bg-muted dark:bg-gray-800 rounded-md">
                  <p className="text-sm text-foreground">
                    Selected template: <strong>{templates.find((t) => t.id === formData.template_id)?.name}</strong>
                  </p>
                </div>
              )}

              <div className="flex justify-end mt-6">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  disabled={!formData.template_id && !formData.content}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Select Recipients */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-foreground">
                    Select Recipients
                  </label>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    {formData.recipient_ids.length} total selected
                    {selectedOnPageCount > 0 && selectedOnPageCount < paginatedContacts.length && (
                      <span className="ml-2 text-gray-500 dark:text-gray-400">({selectedOnPageCount} on this page)</span>
                    )}
                  </div>
                  {/* Page size selector */}
                  <select
                    value={pageSize}
                    onChange={handlePageSizeChange}
                    className="px-2 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 dark:text-gray-300 shadow-sm"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>

                {/* Select All on current page checkbox */}
                {!loadingContacts && paginatedContacts.length > 0 && (
                  <div className="mb-2 flex items-center">
                    <input
                      type="checkbox"
                      checked={
                        paginatedContacts.length > 0 &&
                        selectedOnPageCount === paginatedContacts.length
                      }
                      onChange={handleSelectAllOnPage}
                      className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 mr-2"
                    />
                    <label className="text-sm text-foreground cursor-pointer">
                      Select all on this page ({paginatedContacts.length} contacts)
                      {selectedOnPageCount === paginatedContacts.length && (
                        <span className="ml-2 text-green-600 dark:text-green-400">✓ All selected</span>
                      )}
                    </label>
                  </div>
                )}

                {/* Contacts list */}
                <div className="border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden">
                  {loadingContacts ? (
                    <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      Loading contacts...
                    </div>
                  ) : paginatedContacts.length === 0 ? (
                    <div className="h-64 flex items-center justify-center text-gray-500 dark:text-gray-400">
                      No contacts yet. Add contacts first.
                      <br />
                      <a href="/contacts" className="text-blue-600 dark:text-blue-400 hover:underline ml-2">
                        Go to Contacts
                      </a>
                    </div>
                  ) : (
                    <>
                      {/* Table header */}
                      <div className="bg-muted dark:bg-gray-800 grid grid-cols-12 gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        <div className="col-span-1"></div>
                        <div className="col-span-4">Name</div>
                        <div className="col-span-4">Email</div>
                        <div className="col-span-3">Company</div>
                      </div>

                      {/* Table rows */}
                      <div className="max-h-80 overflow-y-auto">
                        {paginatedContacts.map((contact) => (
                          <label
                            key={contact.id}
                            className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-muted dark:hover:bg-gray-800 cursor-pointer items-center"
                          >
                            <div className="col-span-1">
                              <input
                                type="checkbox"
                                checked={formData.recipient_ids.includes(contact.id)}
                                onChange={() => handleContactToggle(contact.id)}
                                className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                              />
                            </div>
                            <div className="col-span-4 text-sm text-foreground truncate">
                              {contact.first_name || contact.last_name
                                ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '—'
                                : '—'}
                            </div>
                            <div className="col-span-4 text-sm text-foreground truncate">
                              {contact.email}
                            </div>
                            <div className="col-span-3 text-sm text-gray-500 dark:text-gray-400 truncate">
                              {contact.company || '—'}
                            </div>
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Pagination controls */}
                {!loadingContacts && totalPages > 1 && (
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Showing {(currentPage - 1) * pageSize + 1}-
                      {Math.min(currentPage * pageSize, totalContacts)} of {totalContacts} contacts
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => goToPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        className="px-3 py-1.5 text-sm font-medium bg-background dark:bg-card border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-muted dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-foreground shadow-sm transition-colors"
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
                              type="button"
                              onClick={() => goToPage(pageNum)}
                              className={`w-8 h-8 text-sm font-medium rounded-lg transition-colors ${
                                currentPage === pageNum
                                  ? 'bg-blue-600 text-white shadow-md'
                                  : 'bg-background dark:bg-card text-foreground border border-gray-300 dark:border-gray-600 hover:bg-muted dark:hover:bg-gray-800'
                              }`}
                            >
                              {pageNum}
                            </button>
                          )
                        })}
                      </div>
                      <button
                        type="button"
                        onClick={() => goToPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1.5 text-sm font-medium bg-background dark:bg-card border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-muted dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-foreground shadow-sm transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Email Provider Selection */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-sm font-medium text-foreground mb-2">
                  Email Provider
                </label>
                <div className="space-y-2">
                  <label className="flex items-start">
                    <input
                      type="radio"
                      value="resend"
                      checked={formData.email_provider === 'resend'}
                      onChange={(e) => setFormData({ ...formData, email_provider: e.target.value as 'resend' })}
                      className="h-4 w-4 mt-1 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-foreground">
                      <strong>Resend</strong> - Fast, reliable, with analytics
                      {formData.email_provider === 'resend' && (
                        <span className="block text-xs text-blue-600 dark:text-blue-400 mt-1">
                          📧 Campaigns will be sent from: {formData.sender_name || senderName} &lt;{senderEmail}&gt;
                        </span>
                      )}
                    </span>
                  </label>
                  <label className="flex items-start">
                    <input
                      type="radio"
                      value="gmail"
                      checked={formData.email_provider === 'gmail'}
                      onChange={(e) => setFormData({ ...formData, email_provider: e.target.value as 'gmail' })}
                      className="h-4 w-4 mt-1 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-foreground">
                      <strong>Gmail SMTP</strong> - Send from your personal Gmail (max 500/day)
                      {formData.email_provider === 'gmail' && (
                        <span className="block text-xs text-orange-600 dark:text-orange-400 mt-1">
                          ⚠️ Make sure you've configured your Gmail settings in Dashboard → Settings
                        </span>
                      )}
                    </span>
                  </label>
                </div>

                {/* Editable From Name */}
                <div className="mt-4">
                  <label htmlFor="sender_name" className="block text-sm font-medium text-foreground mb-2">
                    From Name
                  </label>
                  <input
                    id="sender_name"
                    type="text"
                    value={formData.sender_name}
                    onChange={(e) => setFormData({ ...formData, sender_name: e.target.value })}
                    placeholder={senderName}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    This name will appear in the recipient's inbox as the sender.
                  </p>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-foreground hover:bg-muted dark:hover:bg-gray-700"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  disabled={formData.recipient_ids.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review & Send */}
          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="font-medium text-foreground">Campaign Details</h3>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</dt>
                    <dd className="text-sm text-foreground">{formData.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Subject</dt>
                    <dd className="text-sm text-foreground">{formData.subject}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">From</dt>
                    <dd className="text-sm text-foreground">
                      {formData.sender_name || senderName} &lt;{senderEmail}&gt;
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email Provider</dt>
                    <dd className="text-sm text-foreground capitalize">{formData.email_provider}</dd>
                  </div>
                  {formData.email_provider === 'resend' && (
                    <div className="col-span-2">
                      <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Note</dt>
                      <dd className="text-sm text-amber-600 dark:text-amber-500">
                        ⚠️ Your domain ({senderEmail.split('@')[1]}) must be verified in Resend.
                        If not, emails will bounce. Use Gmail provider if you want to send from @gmail.com.
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Recipients</dt>
                    <dd className="text-sm text-foreground">{formData.recipient_ids.length} contacts</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Schedule</dt>
                    <dd className="text-sm text-foreground">
                      {formData.scheduled_at ? new Date(formData.scheduled_at).toLocaleString() : 'Send immediately'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="font-medium text-foreground mb-2">Preview</h3>
                <div
                  className="border border-gray-200 dark:border-gray-700 rounded-md p-4 bg-muted dark:bg-gray-800 max-h-64 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: formData.html_content }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Schedule (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_at ? formatDateTimeLocal(formData.scheduled_at) : ''}
                  onChange={(e) => {
                    const value = e.target.value
                    // Convert local datetime to UTC ISO string
                    const utcDate = value ? new Date(value).toISOString() : ''
                    setFormData({ ...formData, scheduled_at: utcDate })
                  }}
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Schedule when to send this campaign. Times are stored in UTC automatically.
                </p>
              </div>

              <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-foreground hover:bg-muted dark:hover:bg-gray-700"
                >
                  Back
                </button>
                <div className="space-x-3">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-foreground hover:bg-muted dark:hover:bg-gray-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Draft'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSendNow}
                    disabled={saving}
                    className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                  >
                    {saving ? 'Sending...' : 'Send Now'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
