import DashboardStats from '@/components/dashboard-stats'
import RecentCampaigns from '@/components/recent-campaigns'

export default async function DashboardPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Overview of your email marketing activity</p>
      </div>

      <DashboardStats />
      <RecentCampaigns />
    </div>
  )
}
