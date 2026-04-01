'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/browser-client'
import { useToast } from '@/components/toast'

interface CSVImportModalProps {
  isOpen: boolean
  onClose: () => void
  onImportComplete: () => void
}

interface ImportResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
}

export default function CSVImportModal({ isOpen, onClose, onImportComplete }: CSVImportModalProps) {
  const supabase = createClient()
  const { addToast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [preview, setPreview] = useState<any[]>([])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')

    if (isExcel) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const buffer = event.target?.result as ArrayBuffer
        parseExcel(buffer)
      }
      reader.readAsArrayBuffer(file)
    } else {
      // CSV
      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        parseCSV(text)
      }
      reader.readAsText(file)
    }
  }

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length === 0) {
      setPreview([])
      return
    }

    // Get headers from first line
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, '').replace(/"/g, ''))

    const emailIdx = findEmailColumn(headers)
    const firstNameIdx = headers.findIndex(h => h === 'first name' || h === 'firstname' || h === 'fname')
    const lastNameIdx = headers.findIndex(h => h === 'last name' || h === 'lastname' || h === 'lname')
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname')

    if (emailIdx === -1) {
      addToast({ message: 'File must contain an "Email" column', type: 'error' })
      return
    }

    // Convert CSV lines to 2D array: each line -> array of values
    const rowsArray: any[][] = lines.slice(1).map(line =>
      line.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/"/g, ''))
    )

    const rows = parseLines(rowsArray, emailIdx, firstNameIdx, lastNameIdx, nameIdx)
    setPreview(rows.slice(0, 5))
    setResult(null)
  }

  const parseExcel = (buffer: ArrayBuffer) => {
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    const jsonData = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 })

    if (jsonData.length === 0) {
      setPreview([])
      return
    }

    // First row contains headers
    const headers = jsonData[0].map((h: any) =>
      String(h).trim().toLowerCase().replace(/^"|"$/g, '').replace(/"/g, '')
    )

    const emailIdx = findEmailColumn(headers)
    const firstNameIdx = headers.findIndex(h => h === 'first name' || h === 'firstname' || h === 'fname')
    const lastNameIdx = headers.findIndex(h => h === 'last name' || h === 'lastname' || h === 'lname')
    const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname')

    if (emailIdx === -1) {
      addToast({ message: 'Excel file must contain an "Email" column', type: 'error' })
      return
    }

    const rows = parseLines(jsonData.slice(1), emailIdx, firstNameIdx, lastNameIdx, nameIdx)
    setPreview(rows.slice(0, 5))
    setResult(null)
  }

  const findEmailColumn = (headers: string[]): number => {
    return headers.findIndex(h =>
      h === 'email' || h === 'e-mail' || h === 'email address' || h === 'e mail'
    )
  }

  const parseLines = (lines: any[][], emailIdx: number, firstNameIdx: number, lastNameIdx: number, nameIdx: number): any[] => {
    const rows: any[] = []

    for (let i = 0; i < lines.length; i++) {
      const values: string[] = lines[i].map((v: any) =>
        String(v).trim().replace(/^"|"$/g, '').replace(/"/g, '')
      )

      const email = values[emailIdx]

      if (!email) continue

      let firstName = ''
      let lastName = ''

      if (nameIdx !== -1) {
        const fullName = values[nameIdx] || ''
        const parts = fullName.split(' ')
        firstName = parts[0] || ''
        lastName = parts.slice(1).join(' ') || ''
      } else {
        firstName = firstNameIdx !== -1 ? (values[firstNameIdx] || '') : ''
        lastName = lastNameIdx !== -1 ? (values[lastNameIdx] || '') : ''
      }

      rows.push({
        email: email.toLowerCase(),
        first_name: firstName || null,
        last_name: lastName || null,
        rowNumber: i + 2 // +2 because we skip header and 0-indexed
      })
    }

    return rows
  }

  const handleImport = async () => {
    if (preview.length === 0) {
      addToast({ message: 'No data to import. Please upload a file first.', type: 'error' })
      return
    }

    setUploading(true)
    setResult(null)

    try {
      const file = fileInputRef.current?.files?.[0]
      if (!file) {
        throw new Error('No file selected')
      }

      const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
      let allRows: any[]

      if (isExcel) {
        const buffer = await file.arrayBuffer()
        const workbook = XLSX.read(buffer, { type: 'array' })
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
        const jsonData = XLSX.utils.sheet_to_json<any[]>(firstSheet, { header: 1 })

        if (jsonData.length === 0) {
          throw new Error('Excel file is empty')
        }

        const headers = jsonData[0].map((h: any) =>
          String(h).trim().toLowerCase().replace(/^"|"$/g, '').replace(/"/g, '')
        )

        const emailIdx = findEmailColumn(headers)
        const firstNameIdx = headers.findIndex(h => h === 'first name' || h === 'firstname' || h === 'fname')
        const lastNameIdx = headers.findIndex(h => h === 'last name' || h === 'lastname' || h === 'lname')
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname')

        if (emailIdx === -1) {
          throw new Error('Excel file must contain an "Email" column')
        }

        allRows = parseLines(jsonData.slice(1), emailIdx, firstNameIdx, lastNameIdx, nameIdx)
      } else {
        // CSV
        const text = await file.text()
        const lines = text.split('\n').filter(line => line.trim())

        if (lines.length === 0) {
          throw new Error('CSV file is empty')
        }

        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, '').replace(/"/g, ''))

        const emailIdx = findEmailColumn(headers)
        const firstNameIdx = headers.findIndex(h => h === 'first name' || h === 'firstname' || h === 'fname')
        const lastNameIdx = headers.findIndex(h => h === 'last name' || h === 'lastname' || h === 'lname')
        const nameIdx = headers.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname')

        if (emailIdx === -1) {
          throw new Error('CSV file must contain an "Email" column')
        }

        // Convert CSV lines to 2D array
        const rowsArray: any[][] = lines.slice(1).map(line =>
          line.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/"/g, ''))
        )

        allRows = parseLines(rowsArray, emailIdx, firstNameIdx, lastNameIdx, nameIdx)
      }

      console.log('Parsed rows to import:', allRows.length, allRows)

      if (allRows.length === 0) {
        addToast({ message: 'No valid contacts found in the file. Please check the email column.', type: 'error' })
        setUploading(false)
        return
      }

      // Import with batching
      const importResults: ImportResult = {
        total: allRows.length,
        imported: 0,
        skipped: 0,
        errors: []
      }

      // Get current user ID for RLS
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        throw new Error('Not authenticated')
      }

      const batchSize = 50
      for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, i + batchSize)
        const contactsToInsert = batch.map(row => ({
          user_id: user.id,
          email: row.email,
          first_name: row.first_name || null,
          last_name: row.last_name || null,
          status: 'active'
        }))

        console.log(`Inserting batch ${Math.floor(i / batchSize) + 1}:`, contactsToInsert)

        if (contactsToInsert.length > 0) {
          try {
            const { data, error } = await supabase
              .from('contacts')
              .upsert(contactsToInsert, {
                onConflict: 'user_id,email',
                ignoreDuplicates: true
              })

            if (error) {
              throw error
            }

            console.log(`Batch ${Math.floor(i / batchSize) + 1} result:`, data)
            importResults.imported += contactsToInsert.length
          } catch (err: any) {
            console.error(`Batch ${Math.floor(i / batchSize) + 1} error:`, err)
            importResults.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${err.message}`)
            importResults.skipped += contactsToInsert.length
          }
        }
      }

      console.log('Import complete:', importResults)
      setResult(importResults)
      onImportComplete()
    } catch (err: any) {
      console.error('Import failed:', err)
      addToast({ message: 'Import failed: ' + err.message, type: 'error' })
    } finally {
      setUploading(false)
    }
  }

  const reset = () => {
    setPreview([])
    setResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 overflow-y-auto flex items-start justify-center py-8 z-50">
      <div className="relative w-full max-w-2xl mx-auto p-5 bg-card shadow-xl rounded-lg max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4 sticky top-0 bg-card pb-2">
          <h3 className="text-lg font-medium text-foreground">Import Contacts</h3>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-500 dark:hover:text-gray-400 text-xl">✕</button>
        </div>

        {/* Instructions */}
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-md">
          <h4 className="font-medium text-blue-900 dark:text-blue-400 mb-2">File Format Requirements:</h4>
          <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
            <li>• Supported formats: <strong>CSV</strong>, <strong>Excel</strong> (.xlsx, .xls)</li>
            <li>• Must include an <strong>Email</strong> column (required)</li>
            <li>• Optional columns: <strong>First Name</strong>, <strong>Last Name</strong>, or <strong>Name</strong> (full name)</li>
            <li>• Additional columns will be ignored</li>
            <li>• Duplicate emails will be skipped (unique constraint)</li>
          </ul>
        </div>

        {/* File Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-foreground mb-2">Upload CSV or Excel File</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/40"
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-foreground mb-2">Preview (first {preview.length} rows):</h4>
            <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-x-auto">
              <table className="min-w-full divide-y divide-border dark:divide-gray-700">
                <thead className="bg-muted dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">First Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Last Name</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border dark:divide-gray-700">
                  {preview.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">{row.rowNumber}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{row.email}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{row.first_name}</td>
                      <td className="px-4 py-2 text-sm text-foreground">{row.last_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Results */}
        {result && (
          <div className={`mb-6 p-4 rounded-md ${result.errors.length > 0 ? 'bg-yellow-50 dark:bg-yellow-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
            <h4 className={`font-medium mb-2 ${result.errors.length > 0 ? 'text-yellow-900 dark:text-yellow-500' : 'text-green-900 dark:text-green-400'}`}>
              Import Results
            </h4>
            <ul className={`text-sm space-y-1 ${result.errors.length > 0 ? 'text-yellow-800 dark:text-yellow-400' : 'text-green-800 dark:text-green-300'}`}>
              <li>Total rows processed: {result.total}</li>
              <li>Successfully imported: {result.imported}</li>
              <li>Skipped: {result.skipped}</li>
              {result.errors.length > 0 && result.errors.slice(0, 10).map((err, idx) => (
                <li key={idx} className="text-xs">• {err}</li>
              ))}
              {result.errors.length > 10 && (
                <li>... and {result.errors.length - 10} more errors</li>
              )}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={() => { reset(); onClose(); }}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-muted dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={uploading || preview.length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {uploading ? 'Importing...' : 'Import Contacts'}
          </button>
        </div>
      </div>
    </div>
  )
}
