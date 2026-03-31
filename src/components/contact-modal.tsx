'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

interface ContactModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  contact: any | null
}

export default function ContactModal({ isOpen, onClose, onSave, contact }: ContactModalProps) {
  const supabase = createClient()
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    company: '',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (contact) {
      setFormData({
        email: contact.email || '',
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        phone: contact.phone || '',
        company: contact.company || '',
        tags: contact.tags?.join(', ') || '',
      })
    } else {
      setFormData({
        email: '',
        first_name: '',
        last_name: '',
        phone: '',
        company: '',
        tags: '',
      })
    }
    setError(null)
  }, [contact, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const tagsArray = formData.tags
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t !== '')

      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      if (contact) {
        // Update existing contact
        const { error } = await supabase
          .from('contacts')
          .update({
            email: formData.email,
            first_name: formData.first_name || null,
            last_name: formData.last_name || null,
            phone: formData.phone || null,
            company: formData.company || null,
            tags: tagsArray,
          })
          .eq('id', contact.id)
          .eq('user_id', user.id)

        if (error) throw error
      } else {
        // Create new contact
        const { error } = await supabase.from('contacts').insert({
          user_id: user.id,
          email: formData.email,
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          phone: formData.phone || null,
          company: formData.company || null,
          tags: tagsArray,
          status: 'active',
        })

        if (error) {
          if (error.code === '23505') {
            throw new Error('A contact with this email already exists')
          }
          throw error
        }
      }

      onSave()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto flex items-start justify-center py-8 z-50">
      <div className="relative w-full max-w-md mx-auto p-5 bg-white shadow-xl rounded-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2">
          <h3 className="text-lg font-medium text-gray-900">
            {contact ? 'Edit Contact' : 'Add Contact'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 text-xl">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email *</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name</label>
              <input
                type="text"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input
                type="text"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Company</label>
            <input
              type="text"
              value={formData.company}
              onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Tags (comma separated)</label>
            <input
              type="text"
              value={formData.tags}
              onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
              placeholder="prospect, customer, vip"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-2 rounded">{error}</div>
          )}

          <div className="flex justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
