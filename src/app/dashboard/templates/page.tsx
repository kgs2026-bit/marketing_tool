'use client'

import { useEffect, useState } from 'react'
import TemplateTable from '@/components/template-table'
import TemplateEditor from '@/components/template-editor'
import { createClient } from '@/lib/supabase/browser-client'
import { useToast } from '@/components/toast'
import { useConfirmation } from '@/components/confirmation-provider'

export default function TemplatesPage() {
  const { addToast } = useToast()
  const { confirm } = useConfirmation()
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any>(null)
  const supabase = createClient()

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error) throw error
      setTemplates(data || [])
    } catch (error) {
      console.error('Error fetching templates:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTemplates()
  }, [])

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Template',
      message: 'Are you sure you want to delete this template? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      type: 'danger',
    })
    if (!confirmed) return

    const { error } = await supabase.from('templates').delete().eq('id', id)
    if (error) {
      addToast({ message: 'Error deleting template: ' + error.message, type: 'error' })
    } else {
      fetchTemplates()
      addToast({ message: 'Template deleted successfully', type: 'success' })
    }
  }

  const handleEdit = (template: any) => {
    setEditingTemplate(template)
    setIsEditorOpen(true)
  }

  const handleCloseEditor = () => {
    setIsEditorOpen(false)
    setEditingTemplate(null)
  }

  const handleSave = () => {
    handleCloseEditor()
    fetchTemplates()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Templates</h1>
          <p className="mt-2 text-gray-600">Create and manage email templates</p>
        </div>
        <button
          onClick={() => setIsEditorOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Create Template
        </button>
      </div>

      <TemplateTable
        templates={templates}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <TemplateEditor
        isOpen={isEditorOpen}
        onClose={handleCloseEditor}
        onSave={handleSave}
        template={editingTemplate}
      />
    </div>
  )
}
