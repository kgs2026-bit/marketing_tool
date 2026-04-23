import Navigation from '@/components/navigation'
import SessionProvider from '@/components/session-provider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-background dark:bg-background">
      <SessionProvider>
        <Navigation />
        <main className="max-w-7xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </SessionProvider>
    </div>
  )
}
