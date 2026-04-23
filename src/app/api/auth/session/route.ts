import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-auth-token')?.value

    if (!accessToken) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    // Try to parse the session from the cookie
    let sessionData
    try {
      sessionData = JSON.parse(accessToken)
    } catch {
      // If it's not JSON, it's just the token
      sessionData = { access_token: accessToken }
    }

    // You could also validate the token with Supabase here
    // For now, return a basic user object
    return NextResponse.json({
      user: sessionData.user || {
        email: 'user@example.com', // This would normally come from the token
        id: 'user-id' // This would normally come from the token
      }
    })
  } catch (error) {
    console.error('Session API error:', error)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
