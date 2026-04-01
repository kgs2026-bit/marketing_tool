'use client'

import { useEffect, useState } from 'react'
import ContactTable from '@/components/contact-table'
import ContactModal from '@/components/contact-modal'
import CSVImportModal from '@/components/csv-import-modal'
import { createClient } from '@/lib/supabase/browser-client'
import { useToast } from '@/components/toast'
import { useConfirmation } from '@/components/confirmation-provider'

export default function ContactsPage() {
  const { addToast } = useToast()
  const { confirm } = useConfirmation()
  const [contacts, setContacts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)
  const [isImportModalOpen, setIsImportModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [totalContacts, setTotalContacts] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const supabase = createClient()

  const fetchContacts = async (page: number = 1, size: number = pageSize) => {
    setLoading(true)
    try {
      // Get total count
      const { count } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .order('created_at', { ascending: false })

      const total = count || 0
      setTotalContacts(total)
      setTotalPages(Math.ceil(total / size))

      // Get paginated contacts
      const from = (page - 1) * size
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .order('created_at', { ascending: false })
        .range(from, from + size - 1)

      if (error) throw error
      setContacts(data || [])
      setCurrentPage(page)
    } catch (error) {
      console.error('Error fetching contacts:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchContacts(currentPage, pageSize)
  }, [currentPage, pageSize])

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: 'Delete Contact',
      message: 'Are you sure you want to delete this contact? This action cannot be undone.',
      confirmLabel: 'Delete',
      cancelLabel: 'Cancel',
      type: 'danger',
    })
    if (!confirmed) return

    const { error } = await supabase.from('contacts').delete().eq('id', id)
    if (error) {
      addToast({ message: 'Error deleting contact: ' + error.message, type: 'error' })
    } else {
      fetchContacts(currentPage, pageSize)
      addToast({ message: 'Contact deleted successfully', type: 'success' })
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
    fetchContacts(currentPage, pageSize)
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Contacts</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your email contacts</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium"
        >
          Add Contact
        </button>
      </div>

      {/* Import/Export buttons */}
      <div className="bg-card p-4 rounded-lg shadow flex space-x-3">
        <button
          onClick={() => setIsImportModalOpen(true)}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 font-medium"
        >
          📥 Import CSV
        </button>
        <button
          onClick={() => addToast({ message: 'CSV export coming soon!', type: 'info' })}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
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

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 bg-card p-4 rounded-lg shadow">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-foreground">Show:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value))
                setCurrentPage(1)
              }}
              className="px-2 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-700 dark:text-gray-300 shadow-sm"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            <span className="text-sm font-medium text-foreground">per page</span>
          </div>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {totalContacts > 0 ? (currentPage - 1) * pageSize + 1 : 0}-
            {Math.min(currentPage * pageSize, totalContacts)} of {totalContacts} contacts
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
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
                    onClick={() => setCurrentPage(pageNum)}
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
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 text-sm font-medium bg-background dark:bg-card border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-muted dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed text-foreground shadow-sm transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}

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
          fetchContacts(currentPage, pageSize)
          setIsImportModalOpen(false)
        }}
      />
    </div>
  )
}
