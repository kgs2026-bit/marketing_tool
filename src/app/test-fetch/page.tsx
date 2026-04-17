'use client'

import { useState } from 'react'

export default function TestFetchPage() {
  const [logs, setLogs] = useState<string[]>([])

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`])
    console.log(msg)
  }

  const testFetch = async () => {
    setLogs([])
    addLog('Starting fetch tests...')

    // Test 1: Check if fetch is natively available
    addLog(`fetch type: ${typeof fetch}`)
    addLog(`fetch toString length: ${fetch.toString().length}`)
    addLog(`fetch is native: ${fetch.toString().includes('[native code]')}`)

    // Test 2: Try fetch to a public API (should work)
    addLog('Testing fetch to httpbin.org (public test API)...')
    try {
      const res1 = await fetch('https://httpbin.org/get', { method: 'GET' })
      addLog(`httpbin.org status: ${res1.status} ${res1.statusText}`)
      const data1 = await res1.json()
      addLog(`httpbin.org response received, origin: ${data1.origin}`)
    } catch (err: any) {
      addLog(`❌ httpbin.org FAILED: ${err.message}`)
    }

    // Test 3: Try fetch to Supabase health
    addLog('Testing fetch to Supabase health endpoint...')
    try {
      const res2 = await fetch('https://acwwxlneuqcpqdntdbnj.supabase.co/auth/v1/health', {
        method: 'HEAD',
        mode: 'cors',
      })
      addLog(`Supabase status: ${res2.status} ${res2.statusText}`)
      addLog(`Supabase type: ${res2.type}`)
    } catch (err: any) {
      addLog(`❌ Supabase FAILED: ${err.message} (${err.constructor.name})`)
      addLog(`Stack: ${err.stack?.substring(0, 200)}...`)
    }

    // Test 4: Try with XHR
    addLog('Testing XMLHttpRequest to Supabase...')
    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        const timeout = setTimeout(() => {
          xhr.abort()
          reject(new Error('Timeout'))
        }, 10000)
        xhr.onload = () => {
          clearTimeout(timeout)
          resolve(xhr.status)
        }
        xhr.onerror = () => {
          clearTimeout(timeout)
          reject(new Error('Network error'))
        }
        xhr.open('HEAD', 'https://acwwxlneuqcpqdntdbnj.supabase.co/auth/v1/health')
        xhr.send()
      })
      addLog('✅ XHR succeeded')
    } catch (err: any) {
      addLog(`❌ XHR FAILED: ${err.message}`)
    }

    // Test 5: Check if any CSP is blocking
    addLog('Checking CSP meta tags...')
    const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
    if (cspMeta) {
      addLog(`CSP found: ${cspMeta.getAttribute('content')}`)
    } else {
      addLog('No CSP meta tag found')
    }

    // Test 6: Check browser extension interference
    addLog('Checking for common extension artifacts...')
    const hasDataAttr = document.body.hasAttribute('data-new-gr-c-s-check-loaded')
    addLog(`Has Grammarly/extension data attrs: ${hasDataAttr}`)

    addLog('Tests complete!')
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Fetch Connectivity Test</h1>
      <button
        onClick={testFetch}
        className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
      >
        Run Fetch Tests
      </button>

      <div className="mt-6 bg-black text-green-400 p-4 rounded-lg font-mono text-sm max-h-96 overflow-auto">
        {logs.length === 0 ? (
          <p className="text-gray-500">Click the button to start tests...</p>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))
        )}
      </div>

      <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <h2 className="font-bold text-yellow-800 mb-2">Instructions:</h2>
        <ol className="list-decimal list-inside space-y-1 text-yellow-800">
          <li>Click &quot;Run Fetch Tests&quot; button above</li>
          <li>Check the results in the terminal output below</li>
          <li>Look for which tests pass/fail</li>
          <li>Share the full output with me</li>
        </ol>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
        <h2 className="font-bold text-blue-800 mb-2">What to look for:</h2>
        <ul className="list-disc list-inside space-y-1 text-blue-800">
          <li>Does httpbin.org work? (it should) </li>
          <li>Does Supabase health endpoint work?</li>
          <li>Does XHR work? (different from fetch)</li>
          <li>Any CSP warnings?</li>
          <li>Extension artifacts detected?</li>
        </ul>
      </div>
    </div>
  )
}
