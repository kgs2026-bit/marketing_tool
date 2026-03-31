'use client'

import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@/lib/supabase/browser-client'

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
      alert('File must contain an "Email" column')
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
      alert('Excel file must contain an "Email" column')
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
      alert('No data to import')
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

      // Import with batching
      const importResults: ImportResult = {
        total: allRows.length,
        imported: 0,
        skipped: 0,
        errors: []
      }

      const batchSize = 50
      for (let i = 0; i < allRows.length; i += batchSize) {
        const batch = allRows.slice(i, i + batchSize)
        const contactsToInsert = batch.map(row => ({
          email: row.email,
          first_name: row.first_name,
          last_name: row.last_name,
          status: 'active'
        }))

        if (contactsToInsert.length > 0) {
          try {
            const { error } = await supabase
              .from('contacts')
              .upsert(contactsToInsert, {
                onConflict: 'user_id,email',
                ignoreDuplicates: true
              })

            if (error) {
              throw error
            }

            importResults.imported += contactsToInsert.length
          } catch (err: any) {
            importResults.errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${err.message}`)
            importResults.skipped += contactsToInsert.length
          }
        }
      }

      setResult(importResults)
      onImportComplete()
    } catch (err: any) {
      alert('Import failed: ' + err.message)
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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">Import Contacts</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">✕</button>
        </div>

        {/* Instructions */}
        <div className="mb-6 p-4 bg-blue-50 rounded-md">
          <h4 className="font-medium text-blue-900 mb-2">File Format Requirements:</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• Supported formats: <strong>CSV</strong>, <strong>Excel</strong> (.xlsx, .xls)</li>
            <li>• Must include an <strong>Email</strong> column (required)</li>
            <li>• Optional columns: <strong>First Name</strong>, <strong>Last Name</strong>, or <strong>Name</strong> (full name)</li>
            <li>• Additional columns will be ignored</li>
            <li>• Duplicate emails will be skipped (unique constraint)</li>
          </ul>
        </div>

        {/* File Upload */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Upload CSV or Excel File</label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
        </div>

        {/* Preview */}
        {preview.length > 0 && (
          <div className="mb-6">
            <h4 className="font-medium text-gray-900 mb-2">Preview (first {preview.length} rows):</h4>
            <div className="border border-gray-200 rounded-md overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">First Name</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Last Name</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {preview.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2 text-sm text-gray-500">{row.rowNumber}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{row.email}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{row.first_name}</td>
                      <td className="px-4 py-2 text-sm text-gray-900">{row.last_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Import Results */}
        {result && (
          <div className={`mb-6 p-4 rounded-md ${result.errors.length > 0 ? 'bg-yellow-50' : 'bg-green-50'}`}>
            <h4 className={`font-medium mb-2 ${result.errors.length > 0 ? 'text-yellow-900' : 'text-green-900'}`}>
              Import Results
            </h4>
            <ul className={`text-sm space-y-1 ${result.errors.length > 0 ? 'text-yellow-700' : 'text-green-700'}`}>
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
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
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
