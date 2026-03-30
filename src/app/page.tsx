import { redirect } from 'next/navigation'
import { createClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: { user } } = await supabase.auth.getUser()

  // If user is logged in, redirect to dashboard
  if (user) {
    redirect('/dashboard')
  }

  // Show landing page for unauthenticated users
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="px-6 py-4 flex justify-between items-center max-w-7xl mx-auto">
        <div className="text-2xl font-bold text-indigo-900">
          EmailFlow
        </div>
        <div className="flex gap-4">
          <a
            href="/login"
            className="px-4 py-2 text-indigo-900 font-medium hover:text-indigo-700 transition-colors"
          >
            Sign In
          </a>
          <a
            href="/register"
            className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Get Started Free
          </a>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-6 py-20">
        <div className="text-center max-w-4xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6 tracking-tight">
            Send Beautiful Emails That{' '}
            <span className="text-indigo-600">Convert</span>
          </h1>
          <p className="text-xl text-gray-600 mb-10 leading-relaxed">
            Build, send, and track email campaigns with ease. Connect with your
            audience using powerful templates, segmentation, and real-time
            analytics.
          </p>
          <div className="flex gap-4 justify-center mb-16">
            <a
              href="/register"
              className="px-8 py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
            >
              Start Free Trial
            </a>
            <a
              href="#features"
              className="px-8 py-4 bg-white text-indigo-900 font-semibold rounded-xl border-2 border-indigo-100 hover:border-indigo-200 transition-all"
            >
              Learn More
            </a>
          </div>
        </div>

        <div id="features" className="grid md:grid-cols-3 gap-8 mt-20">
          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Email Campaigns</h3>
            <p className="text-gray-600">
              Create and send targeted email campaigns with our intuitive drag-and-drop editor.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Real-time Analytics</h3>
            <p className="text-gray-600">
              Track opens, clicks, bounces, and conversions with detailed analytics dashboards.
            </p>
          </div>

          <div className="bg-white p-8 rounded-2xl shadow-sm">
            <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Contact Management</h3>
            <p className="text-gray-600">
              Import and manage your contact lists with ease. Segment your audience for better targeting.
            </p>
          </div>
        </div>

        <div className="mt-24 text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Start Sending Emails Today
          </h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Join thousands of businesses using EmailFlow to connect with their audience.
            No credit card required to get started.
          </p>
          <a
            href="/register"
            className="inline-flex items-center px-8 py-4 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            Create Free Account
            <svg className="ml-2 w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </a>
        </div>
      </main>

      <footer className="mt-20 py-8 border-t border-gray-200">
        <div className="max-w-7xl mx-auto px-6 text-center text-gray-500">
          <p>&copy; 2024 EmailFlow. Built with Next.js, Supabase, and Resend.</p>
        </div>
      </footer>
    </div>
  )
}
