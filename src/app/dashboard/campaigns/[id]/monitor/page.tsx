'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser-client'

interface WorkflowEvent {
  type: string
  current: number
  total: number
  success: boolean
  email: string
}

export default function CampaignMonitorPage() {
  const params = useParams()
  const campaignId = params.id as string
  const [runId, setRunId] = useState<string | null>(null)
  const [events, setEvents] = useState<WorkflowEvent[]>([])
  const [status, setStatus] = useState<string>('loading')
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  useEffect(() => {
    // Fetch the latest workflow run for this campaign
    const fetchRunId = async () => {
      const { data } = await supabase
        .from('campaigns')
        .select('*')
        .eq('id', campaignId)
        .single()

      if (data) {
        // We'll need to store runId in campaigns table or fetch from workflows
        // For now, we'll ask user to provide it
      }
    }

    fetchRunId()
  }, [campaignId])

  const pollStatus = async () => {
    if (!runId) return

    try {
      const res = await fetch(`/api/workflows/${runId}`)
      const data = await res.json()

      setStatus(data.status)
      setEvents((prev) => {
        // Append new events
        const existingCount = prev.length
        const newEvents = data.events.slice(existingCount)
        return [...prev, ...newEvents]
      })

      if (data.status === 'completed' || data.status === 'failed') {
        setError(data.error || null)
      }
    } catch (err: any) {
      console.error('Poll error:', err)
    }
  }

  useEffect(() => {
    if (!runId) return
    const interval = setInterval(pollStatus, 2000)
    return () => clearInterval(interval)
  }, [runId])

  const sentCount = events.filter(e => e.success).length
  const failedCount = events.filter(e => !e.success).length

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Campaign Progress</h1>
        <p className="text-gray-600">Monitoring campaign execution</p>
      </div>

      {!runId ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800">
            Workflow Run ID not found. Please provide it manually or check campaign details.
          </p>
          <p className="text-sm text-yellow-700 mt-2">
            The runId should have been returned when you clicked "Send". Check browser console or network tab.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">Status</div>
              <div className="text-xl font-bold capitalize">{status}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">Sent</div>
              <div className="text-xl font-bold text-green-600">{sentCount}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">Failed</div>
              <div className="text-xl font-bold text-red-600">{failedCount}</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-sm text-gray-600">Total</div>
              <div className="text-xl font-bold">{events.length + (status === 'running' ? '...' : '')}</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b">
              <h3 className="font-medium">Recent Activity</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {events.length === 0 ? (
                <p className="p-4 text-gray-500">Waiting for events...</p>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Email</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {events.slice(-50).reverse().map((event, idx) => (
                      <tr key={idx} className={event.success ? '' : 'bg-red-50'}>
                        <td className="px-4 py-2 text-sm text-gray-500">
                          {new Date().toLocaleTimeString()}
                        </td>
                        <td className="px-4 py-2 text-sm text-gray-900">{event.email}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            event.success
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}>
                            {event.success ? 'Sent' : 'Failed'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
