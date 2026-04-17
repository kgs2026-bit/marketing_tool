'use client'

import { useState, useEffect } from 'react'

export default function DiagnosticsPage() {
  const [tests, setTests] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const addTest = (name: string, status: 'pending' | 'running' | 'success' | 'error', details?: any) => {
    setTests(prev => [...prev, { name, status, details, timestamp: new Date().toISOString() }])
  }

  const runAllTests = async () => {
    setTests([])
    setLoading(true)

    // Test 1: Environment variables
    addTest('Environment variables', 'running')
    const envVars = {
      NEXT_PUBLIC_SUPABASE_URL: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_SUPABASE_URL : 'SSR only',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: typeof window !== 'undefined' ? (window as any).NEXT_PUBLIC_SUPABASE_ANON_KEY ? '***' : 'MISSING' : 'SSR only',
    }
    addTest('Environment variables', 'success', envVars)

    // Test 2: Direct fetch to Supabase
    addTest('Direct fetch to Supabase (fetch API)', 'running')
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch('https://acwwxlneuqcpqdntdbnj.supabase.co/auth/v1/health', {
        method: 'HEAD',
        mode: 'cors',
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      addTest('Direct fetch to Supabase', 'success', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      })
    } catch (err: any) {
      addTest('Direct fetch to Supabase', 'error', {
        message: err.message,
        name: err.name,
        stack: err.stack,
      })
    }

    // Test 3: XMLHttpRequest (alternative fetch method)
    addTest('XMLHttpRequest test', 'running')
    try {
      const xhr = new XMLHttpRequest()
      const timeoutId = setTimeout(() => {
        xhr.abort()
        throw new Error('Timeout after 10s')
      }, 10000)

      await new Promise((resolve, reject) => {
        xhr.onload = () => {
          clearTimeout(timeoutId)
          resolve(xhr.status)
        }
        xhr.onerror = () => {
          clearTimeout(timeoutId)
          reject(new Error('Network error'))
        }
        xhr.open('HEAD', 'https://acwwxlneuqcpqdntdbnj.supabase.co/auth/v1/health')
        xhr.send()
      })
      addTest('XMLHttpRequest test', 'success', { status: xhr.status })
    } catch (err: any) {
      addTest('XMLHttpRequest test', 'error', { message: err.message })
    }

    // Test 4: Check if fetch is overridden
    addTest('Check fetch override', 'running')
    const fetchString = fetch.toString()
    const isOverridden = fetchString.includes('[native code]') === false || fetchString.length > 100
    addTest('Check fetch override', 'success', {
      isOverridden,
      fetchLength: fetchString.length,
      sample: fetchString.substring(0, 200) + '...',
    })

    // Test 5: Check if there's a service worker
    addTest('Service worker check', 'running')
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      addTest('Service worker check', 'success', {
        count: registrations.length,
        urls: registrations.map(r => r.scope),
      })
    } else {
      addTest('Service worker check', 'success', { message: 'Service workers not supported' })
    }

    // Test 6: Check if document.cookie is accessible
    addTest('Cookie access check', 'running')
    try {
      const testCookie = 'test=value'
      document.cookie = testCookie
      const retrieved = document.cookie.includes('test=value')
      document.cookie = 'test=; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      addTest('Cookie access check', 'success', { success: retrieved, currentCookies: document.cookie })
    } catch (err: any) {
      addTest('Cookie access check', 'error', { message: err.message })
    }

    // Test 7: Try to resolve Supabase domain
    addTest('DNS resolution test', 'running')
    try {
      const dnsTest = await fetch('https://acwwxlneuqcpqdntdbnj.supabase.co/rest/v1/', {
        method: 'OPTIONS',
        mode: 'no-cors',
      })
      addTest('DNS resolution test', 'success', {
        type: dnsTest.type,
        url: dnsTest.url,
        status: dnsTest.status,
      })
    } catch (err: any) {
      addTest('DNS resolution test', 'error', { message: err.message })
    }

    // Test 8: Browser features check
    addTest('Browser features', 'running')
    addTest('Browser features', 'success', {
      userAgent: navigator.userAgent.substring(0, 100),
      supportsFetch: typeof fetch === 'function',
      supportsPromise: typeof Promise === 'function',
      supportsAbortController: typeof AbortController === 'function',
    })

    setLoading(false)
  }

  // Auto-run tests on mount
  useEffect(() => {
    runAllTests()
  }, [])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Supabase Connectivity Diagnostics</h1>

      <div className="mb-6">
        <button
          onClick={runAllTests}
          disabled={loading}
          className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Running tests...' : 'Re-run all tests'}
        </button>
      </div>

      <div className="space-y-4">
        {tests.map((test, index) => (
          <div
            key={index}
            className={`border rounded-lg p-4 ${
              test.status === 'success'
                ? 'border-green-200 bg-green-50'
                : test.status === 'error'
                ? 'border-red-200 bg-red-50'
                : test.status === 'running'
                ? 'border-blue-200 bg-blue-50'
                : 'border-gray-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-lg">{test.name}</h3>
              <span
                className={`px-2 py-1 text-xs font-bold rounded ${
                  test.status === 'success'
                    ? 'bg-green-200 text-green-800'
                    : test.status === 'error'
                    ? 'bg-red-200 text-red-800'
                    : test.status === 'running'
                    ? 'bg-blue-200 text-blue-800'
                    : 'bg-gray-200 text-gray-800'
                }`}
              >
                {test.status.toUpperCase()}
              </span>
            </div>
            {test.details && (
              <pre className="text-sm bg-white p-3 rounded overflow-auto max-h-60">
                {JSON.stringify(test.details, null, 2)}
              </pre>
            )}
            {test.status === 'running' && (
              <div className="text-blue-600 text-sm">Running test...</div>
            )}
          </div>
        ))}
      </div>

      {tests.length === 0 && !loading && (
        <p className="text-gray-600">No tests run yet. Click the button above to start diagnostics.</p>
      )}
    </div>
  )
}
