import { Outlet } from 'react-router-dom'
import useAppStore from '@/stores/app.store'
import BottomNav from './BottomNav'

export default function AppLayout() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)

  // If no active group (shouldn't happen post-onboarding, but guard)
  if (!activeGroupId) return null

  return (
    <div className="app-shell">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
