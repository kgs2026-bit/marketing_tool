'use client'

import { useEffect, useState } from 'react'
import ContactTable from '@/components/contact-table'
import ContactModal from '@/components/contact-modal'
import CSVImportModal from '@/components/csv-import-modal'
import { createClient } from '@/lib/supabase/browser-client'

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const supabase = createClient()

  const fetchContacts = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setContacts(data || [])
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContacts()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return

    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) {
      alert('Error deleting contact: ' + error.message)
    } else {
      fetchContacts()
    }
  }

  const handleEdit = (contact: any) => {
    setEditingContact(contact)
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setEditingContact(null)
  }

  const handleSave = () => {
    handleCloseModal()
    fetchContacts()
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-2 text-gray-600">Manage your email contacts</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Add Contact
        </button>
      </div>

      {/* Import/Export buttons */}
      <div className="bg-white p-4 rounded-lg shadow flex space-x-3">
        <button
          onClick={() => setIsImportModalOpen(true)}
          className="text-sm text-gray-600 hover:text-blue-600 font-medium"
        >
          📥 Import CSV
        </button>
        <button
          onClick={() => alert('CSV export coming soon!')}
          className="text-sm text-gray-600 hover:text-blue-600"
        >
          📤 Export CSV
        </button>
      </div>

      <ContactTable
        contacts={contacts}
        loading={loading}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />

      <ContactModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSave}
        contact={editingContact}
      />

      <CSVImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          fetchContacts()
          setIsImportModalOpen(false)
        }}
      />
    </div>
  )
}
