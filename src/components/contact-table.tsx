'use client'

interface Contact {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  company: string | null
  status: string
  tags: string[]
  created_at: string
}

interface ContactTableProps {
  contacts: Contact[]
  loading: boolean
  onEdit: (contact: Contact) => void
  onDelete: (id: string) => void
  selectedContacts: Set<string>
  onContactSelect: (id: string, selected: boolean) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onSelectAllMode?: (mode: 'page' | 'all') => void
  totalContacts: number
}

export default function ContactTable({
  contacts,
  loading,
  onEdit,
  onDelete,
  selectedContacts,
  onContactSelect,
  onSelectAll,
  onClearSelection,
  onSelectAllMode,
  totalContacts
}: ContactTableProps) {
  if (loading) {
    return (
      <div className="bg-card shadow rounded-lg overflow-hidden">
        <div className="animate-pulse">
          <div className="h-10 bg-gray-200 dark:bg-gray-800"></div>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 border-t border-border dark:border-gray-700"></div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-card shadow rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-border dark:divide-gray-700">
          <thead className="bg-muted dark:bg-gray-800">
            <tr>
              <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={contacts.length > 0 && contacts.every(c => selectedContacts.has(c.id))}
                    onChange={onSelectAll}
                    className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                    title={selectedContacts.size === contacts.length ? 'Deselect all on current page' : 'Select all on current page'}
                  />
                  {onSelectAllMode && (
                    <div className="relative group">
                      <button
                        className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-0.5"
                        title="More selection options"
                      >
                        <span className="text-xs">▼</span>
                      </button>
                      <div className="absolute left-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-md shadow-lg border border-gray-200 dark:border-gray-700 z-10 hidden group-hover:block">
                        <div className="py-1">
                          {(() => {
                            const allPageSelected = contacts.length > 0 && contacts.every(c => selectedContacts.has(c.id))
                            const allSelected = selectedContacts.size === totalContacts && totalContacts > 0
                            return (
                              <>
                                <button
                                  onClick={() => onSelectAllMode('page')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                                >
                                  {allPageSelected ? '✓ ' : ''}Current page ({contacts.length} contacts)
                                </button>
                                <button
                                  onClick={() => onSelectAllMode('all')}
                                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                                  disabled={totalContacts === 0}
                                >
                                  {allSelected ? '✓ ' : ''}All contacts ({totalContacts.toLocaleString()} total)
                                </button>
                              </>
                            )
                          })()}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Email
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Phone
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Tags
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-card divide-y divide-border dark:divide-gray-700">
            {contacts.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                  No contacts yet. Add your first contact!
                </td>
              </tr>
            ) : (
              contacts.map((contact) => (
                <tr key={contact.id} className="hover:bg-muted dark:hover:bg-gray-800">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.id)}
                      onChange={(e) => onContactSelect(contact.id, e.target.checked)}
                      className="h-4 w-4 text-blue-600 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">
                      {contact.first_name || contact.last_name
                        ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || '—'
                        : '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-foreground">{contact.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">{contact.phone || '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500 dark:text-gray-400">{contact.company || '—'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        contact.status === 'active'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400'
                          : contact.status === 'unsubscribed'
                          ? 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400'
                      }`}
                    >
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags?.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 rounded-full"
                        >
                          {tag}
                        </span>
                      )) || '—'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => onEdit(contact)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => onDelete(contact.id)}
                      className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
