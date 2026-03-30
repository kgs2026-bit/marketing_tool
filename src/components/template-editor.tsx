'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

interface TemplateEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: () => void
  template: any | null
}

export default function TemplateEditor({ isOpen, onClose, onSave, template }: TemplateEditorProps) {
  const supabase = createClient()
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    content: '',
    html_content: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'edit' | 'html'>('edit')

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        subject: template.subject || '',
        content: template.content || '',
        html_content: template.html_content || '',
      })
    } else {
      setFormData({
        name: '',
        subject: '',
        content: '',
        html_content: '',
      })
    }
    setView('edit')
    setError(null)
  }, [template, isOpen])

  const convertToHtml = (text: string): string => {
    // Convert line breaks to <br> and basic formatting
    let html = text
      .replace(/\n/g, '<br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // bold
      .replace(/\*(.*?)\*/g, '<em>$1</em>') // italic
    return `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #333;">${html}</div>`
  }

  const handleContentChange = (value: string) => {
    setFormData({
      ...formData,
      content: value,
      html_content: convertToHtml(value),
    })
  }

  const handleHtmlChange = (value: string) => {
    setFormData({
      ...formData,
      html_content: value,
      content: value.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]*>/g, ''), // simple reverse
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      // Ensure we have both content and html_content
      let html = formData.html_content
      if (!html && formData.content) {
        html = convertToHtml(formData.content)
      }

      if (template) {
        const { error } = await supabase
          .from('templates')
          .update({
            name: formData.name,
            subject: formData.subject,
            content: formData.content,
            html_content: html,
          })
          .eq('id', template.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('templates').insert({
          name: formData.name,
          subject: formData.subject,
          content: formData.content,
          html_content: html,
        })

        if (error) throw error
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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            ✕
          </button>
        </div>

        {/* Variable hints */}
        <div className="mb-4 p-3 bg-blue-50 rounded-md text-sm">
          <p className="font-medium text-blue-900">Available variables:</p>
          <p className="text-blue-700">
            {'{{'}{'first_name'}{'}}'}, {'{{'}{'last_name'}{'}}'}, {'{{'}{'email'}{'}}'}, {'{{'}{'company'}{'}}'}, {'{{'}{'unsubscribe_link'}{'}}'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Subject *</label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Use {{first_name}} for personalization"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-gray-700">Content</label>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setView('edit')}
                  className={`px-3 py-1 text-xs rounded ${
                    view === 'edit'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  Edit (Simple)
                </button>
                <button
                  type="button"
                  onClick={() => setView('html')}
                  className={`px-3 py-1 text-xs rounded ${
                    view === 'html'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  HTML
                </button>
              </div>
            </div>
            {view === 'edit' ? (
              <textarea
                rows={10}
                value={formData.content}
                onChange={(e) => handleContentChange(e.target.value)}
                placeholder="Write your email content here. Use **bold** or *italic* formatting."
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
              />
            ) : (
              <textarea
                rows={10}
                value={formData.html_content}
                onChange={(e) => handleHtmlChange(e.target.value)}
                placeholder="Edit HTML directly"
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm font-mono"
              />
            )}
          </div>

          {/* Preview */}
          {formData.html_content && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Preview</label>
              <div
                className="border border-gray-200 rounded-md p-4 bg-gray-50"
                dangerouslySetInnerHTML={{ __html: formData.html_content }}
              />
            </div>
          )}

          {error && (
            <div className="text-red-600 text-sm bg-red-50 p-3 rounded">{error}</div>
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
              {saving ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
