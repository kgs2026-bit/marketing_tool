'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

interface CampaignBuilderProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  campaign: any | null
}

export default function CampaignBuilder({ isOpen, onClose, onSave, campaign }: CampaignBuilderProps) {
  const supabase = createClient()
  const [step, setStep] = useState(1)
  const [templates, setTemplates] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [senderEmail, setSenderEmail] = useState<string>('')
  const [senderName, setSenderName] = useState<string>('')
  const [formData, setFormData] = useState({
    name: '',
    template_id: '',
    subject: '',
    content: '',
    html_content: '',
    recipient_ids: [] as string[],
    scheduled_at: '',
  })

  useEffect(() => {
    if (isOpen) {
      if (campaign) {
        // Load campaign data
        setFormData({
          name: campaign.name || '',
          template_id: campaign.template_id || '',
          subject: campaign.subject || '',
          content: campaign.content || '',
          html_content: campaign.html_content || '',
          recipient_ids: campaign.recipient_list || [],
          scheduled_at: campaign.scheduled_at || '',
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
        })
        setStep(1)
      }
      loadTemplates()
      loadContacts()
      loadSenderInfo()
    }
  }, [isOpen, campaign])

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

  const loadContacts = async () => {
    setLoadingContacts(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setContacts([])
        return
      }
      const { data } = await supabase.from('contacts').select('*').eq('user_id', user.id).eq('status', 'active')
      setContacts(data || [])
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
        scheduled_at: formData.scheduled_at || null,
        status: formData.scheduled_at ? 'scheduled' : 'draft',
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
        alert(`Campaign sent with ${result.sent} successful and ${result.failed} failed deliveries.\n\nFailures:\n${errorList}`)
      } else {
        alert('Campaign sent successfully to all recipients!')
      }
      onSave()
    } catch (err: any) {
      alert('Campaign failed: ' + err.message)
      console.error(err)
      setError(err.message)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-medium text-gray-900">
            {campaign ? 'Edit Campaign' : 'Create Campaign'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
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
                    step >= s ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {s}
                </div>
                {s < 3 && <div className="w-20 h-1 mx-2 bg-gray-200 rounded" />}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2 text-sm text-gray-600">
            <span>1. Choose Template</span>
            <span>2. Select Recipients</span>
            <span>3. Review & Send</span>
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-md">{error}</div>}

        <form onSubmit={handleSubmit}>
          {/* Step 1: Choose Template */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Template</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div
                    className={`border-2 rounded-lg p-4 cursor-pointer ${
                      !formData.template_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setFormData({ ...formData, template_id: '' })}
                  >
                    <div className="font-medium">Custom Email</div>
                    <div className="text-sm text-gray-500">Write your own content</div>
                  </div>
                  {loadingTemplates ? (
                    <div className="col-span-2 text-center py-8 text-gray-500">Loading templates...</div>
                  ) : (
                    templates.map((template) => (
                      <div
                        key={template.id}
                        className={`border-2 rounded-lg p-4 cursor-pointer ${
                          formData.template_id === template.id
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                        onClick={() => handleTemplateSelect(template.id)}
                      >
                        <div className="font-medium">{template.name}</div>
                        <div className="text-sm text-gray-500 truncate">{template.subject}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {formData.template_id && (
                <div className="mt-4 p-4 bg-gray-50 rounded-md">
                  <p className="text-sm">
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
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Recipients ({formData.recipient_ids.length} selected)
                </label>
                <div className="border border-gray-300 rounded-md h-64 overflow-y-auto p-4">
                  {loadingContacts ? (
                    <div className="text-center text-gray-500">Loading contacts...</div>
                  ) : contacts.length === 0 ? (
                    <div className="text-center text-gray-500">
                      No contacts yet. Add contacts first.
                      <br />
                      <a href="/contacts" className="text-blue-600 hover:underline">
                        Go to Contacts
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {contacts.map((contact) => (
                        <label key={contact.id} className="flex items-center space-x-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.recipient_ids.includes(contact.id)}
                            onChange={() => handleContactToggle(contact.id)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm">
                            {contact.first_name} {contact.last_name} - {contact.email}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
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
                <h3 className="font-medium text-gray-900">Campaign Details</h3>
                <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Name</dt>
                    <dd className="text-sm text-gray-900">{formData.name}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Subject</dt>
                    <dd className="text-sm text-gray-900">{formData.subject}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">From</dt>
                    <dd className="text-sm text-gray-900">{senderName} &lt;{senderEmail}&gt;</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Recipients</dt>
                    <dd className="text-sm text-gray-900">{formData.recipient_ids.length} contacts</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Schedule</dt>
                    <dd className="text-sm text-gray-900">
                      {formData.scheduled_at ? new Date(formData.scheduled_at).toLocaleString() : 'Send immediately'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <h3 className="font-medium text-gray-900 mb-2">Preview</h3>
                <div
                  className="border border-gray-200 rounded-md p-4 bg-gray-50 max-h-64 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: formData.html_content }}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Schedule (optional)
                </label>
                <input
                  type="datetime-local"
                  value={formData.scheduled_at.slice(0, 16)}
                  onChange={(e) => setFormData({ ...formData, scheduled_at: e.target.value })}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-between items-center pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <div className="space-x-3">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={saving}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50"
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
