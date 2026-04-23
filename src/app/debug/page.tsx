'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/browser-client'

export default function DebugPage() {
  const [cookies, setCookies] = useState<string[]>([])
  const [session, setSession] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check cookies
    const allCookies = document.cookie.split(';').map(c => c.trim())
    setCookies(allCookies)

    // Check Supabase session
    const supabase = createClient()

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user || null)
    }).catch(err => {
      setError(err.message)
    })
  }, [])

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">Debug Page</h1>

      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Cookies</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {cookies.length > 0 ? cookies.join('\n') : 'No cookies found'}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">Session</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(session, null, 2)}
          </pre>
        </div>

        <div>
          <h2 className="text-xl font-semibold mb-2">User</h2>
          <pre className="bg-gray-100 p-4 rounded text-sm">
            {JSON.stringify(user, null, 2)}
          </pre>
        </div>

        {error && (
          <div>
            <h2 className="text-xl font-semibold mb-2 text-red-600">Error</h2>
            <pre className="bg-red-100 p-4 rounded text-sm text-red-800">
              {error}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}