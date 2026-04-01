'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/browser-client'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import TextAlign from '@tiptap/extension-text-align'

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

  // Initialize TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-600 underline',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
    ],
    content: '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const text = editor.getText()
      setFormData({
        ...formData,
        html_content: html,
        content: text,
      })
    },
  })

  useEffect(() => {
    if (isOpen && editor) {
      if (template) {
        editor.commands.setContent(template.html_content || template.content || '')
        setFormData({
          name: template.name || '',
          subject: template.subject || '',
          content: template.content || '',
          html_content: template.html_content || '',
        })
      } else {
        editor.commands.clearContent()
        setFormData({
          name: '',
          subject: '',
          content: '',
          html_content: '',
        })
      }
      setError(null)
    }
  }, [isOpen, template, editor])

  const setLink = useCallback(() => {
    if (!editor) return

    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('Enter URL:', previousUrl)

    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  if (!isOpen) return null

  if (!editor) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto flex items-start justify-center py-8 z-50">
        <div className="relative w-full max-w-4xl mx-auto p-5 bg-white shadow-xl rounded-lg">
          <p>Loading editor...</p>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      if (template) {
        const { error } = await supabase
          .from('templates')
          .update({
            name: formData.name,
            subject: formData.subject,
            content: formData.content,
            html_content: formData.html_content,
          })
          .eq('id', template.id)
          .eq('user_id', user.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('templates').insert({
          user_id: user.id,
          name: formData.name,
          subject: formData.subject,
          content: formData.content,
          html_content: formData.html_content,
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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto flex items-start justify-center py-8 z-50">
      <div className="relative w-full max-w-5xl mx-auto p-5 bg-white shadow-xl rounded-lg max-h-[90vh] overflow-y-auto text-gray-900">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-white pb-2">
          <h3 className="text-lg font-medium text-gray-900">
            {template ? 'Edit Template' : 'Create Template'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500 text-xl">
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
              <label className="block text-sm font-medium text-gray-800">Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full border border-gray-400 rounded-md shadow-sm py-3 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-800">Subject *</label>
              <input
                type="text"
                required
                value={formData.subject}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                placeholder="Use {{first_name}} for personalization"
                className="mt-1 block w-full border border-gray-400 rounded-md shadow-sm py-3 px-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-base"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Content</label>

            {/* TipTap Editor */}
            <div className="border border-gray-400 rounded-md overflow-hidden">
              {/* Toolbar */}
              <div className="bg-gray-50 border-b border-gray-300 p-2 flex flex-wrap gap-1">
                {/* Text Style */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-2">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`p-2 rounded ${editor?.isActive('bold') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Bold (Ctrl+B)"
                  >
                    <strong>B</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`p-2 rounded ${editor?.isActive('italic') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Italic (Ctrl+I)"
                  >
                    <em>I</em>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    className={`p-2 rounded ${editor?.isActive('strike') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Strikethrough"
                  >
                    <s>S</s>
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    className={`p-2 rounded ${editor?.isActive('code') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Inline Code"
                  >
                    {'</>'}
                  </button>
                </div>

                {/* Headings */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-2">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    className={`px-3 py-2 rounded text-sm ${editor?.isActive('heading', { level: 1 }) ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Heading 1"
                  >
                    H1
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`px-3 py-2 rounded text-sm ${editor?.isActive('heading', { level: 2 }) ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Heading 2"
                  >
                    H2
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    className={`px-3 py-2 rounded text-sm ${editor?.isActive('heading', { level: 3 }) ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Heading 3"
                  >
                    H3
                  </button>
                </div>

                {/* Lists */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-2">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`p-2 rounded ${editor?.isActive('bulletList') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Bullet List"
                  >
                    • List
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    className={`p-2 rounded ${editor?.isActive('orderedList') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Numbered List"
                  >
                    1. List
                  </button>
                </div>

                {/* Alignment */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-2">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    className={`p-2 rounded ${editor?.isActive({ textAlign: 'left' }) ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Align Left"
                  >
                    ⬅
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    className={`p-2 rounded ${editor?.isActive({ textAlign: 'center' }) ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Align Center"
                  >
                    ↔
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    className={`p-2 rounded ${editor?.isActive({ textAlign: 'right' }) ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Align Right"
                  >
                    ➡
                  </button>
                </div>

                {/* Link */}
                <div className="flex items-center gap-1 border-r border-gray-300 pr-2 mr-2">
                  <button
                    type="button"
                    onClick={setLink}
                    className={`p-2 rounded ${editor?.isActive('link') ? 'bg-blue-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Add/Edit Link"
                  >
                    🔗 Link
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().unsetLink().run()}
                    className={`p-2 rounded ${editor?.isActive('link') ? 'bg-red-600 text-white' : 'hover:bg-gray-200'}`}
                    title="Remove Link"
                  >
                    ❌ Unlink
                  </button>
                </div>

                {/* Undo/Redo */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().undo().run()}
                    className="p-2 rounded hover:bg-gray-200"
                    title="Undo (Ctrl+Z)"
                  >
                    ↶ Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => editor.chain().focus().redo().run()}
                    className="p-2 rounded hover:bg-gray-200"
                    title="Redo (Ctrl+Y)"
                  >
                    ↷ Redo
                  </button>
                </div>
              </div>

              {/* Editor */}
              <div className="bg-white p-4 min-h-[400px] max-h-[500px] overflow-y-auto">
                <EditorContent editor={editor} />
              </div>
            </div>
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
