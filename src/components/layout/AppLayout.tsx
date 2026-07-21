import { Outlet } from 'react-router-dom'
import NoSpaceScreen from '@/pages/Onboarding/NoSpaceScreen'
import useAppStore from '@/stores/app.store'
import BottomNav from './BottomNav'

export default function AppLayout() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)

  // No active group — e.g. user deleted their last remaining space.
  if (!activeGroupId) return <NoSpaceScreen />

  return (
    <div className="app-shell">
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  )
}
