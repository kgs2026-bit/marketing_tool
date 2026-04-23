import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const accessToken = cookieStore.get('sb-acwwxlneuqcpqdntdbnj-auth-token')?.value

    if (!accessToken) {
      return NextResponse.json({ user: null }, { status: 200 })
    }

    // You could also validate the token with Supabase here
    // For now, just return a basic user object
    return NextResponse.json({
      user: {
        email: 'user@example.com', // This would normally come from the token
        id: 'user-id' // This would normally come from the token
      }
    })
  } catch (error) {
    console.error('Session API error:', error)
    return NextResponse.json({ user: null }, { status: 200 })
  }
}
