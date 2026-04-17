'use client'

import { createClient } from '@/lib/supabase/browser-client'
import { useState } from 'react'

export default function TestSupabasePage() {
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const testConnection = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const supabase = createClient()
      console.log('Supabase client created:', supabase)

      // Test health endpoint
      const healthResponse = await fetch('https://acwwxlneuqcpqdntdbnj.supabase.co/auth/v1/health')
      console.log('Health check:', healthResponse.status, healthResponse.statusText)
      setResult({ healthStatus: healthResponse.status })

      // Test getSession (should work without login)
      const { data, error: sessionError } = await supabase.auth.getSession()
      console.log('Session data:', data)
      setResult((prev: any) => ({ ...prev, session: data, sessionError }))
    } catch (err: any) {
      console.error('Test error:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const testSignUp = async () => {
    setLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signUp({
        email: 'test@example.com',
        password: 'testpassword123',
      })
      console.log('SignUp result:', { data, error })
      setResult({ signUpData: data, signUpError: error })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Supabase Connection Test</h1>

      <div className="space-y-4">
        <button
          onClick={testConnection}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
        >
          {loading ? 'Testing...' : 'Test Connection'}
        </button>

        <button
          onClick={testSignUp}
          disabled={loading}
          className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-50"
        >
          Test SignUp (no fetch)
        </button>
      </div>

      {result && (
        <pre className="mt-4 p-4 bg-gray-100 rounded overflow-auto max-h-96">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {error && (
        <div className="mt-4 p-4 bg-red-100 text-red-700 rounded">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  )
}
