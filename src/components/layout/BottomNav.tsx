import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeftRight, LayoutDashboard, PiggyBank, Settings, Users } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { db } from '@/db/db'
import { cn } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

const BASE_NAV = [
  { to: '/', label: 'Home', Icon: LayoutDashboard },
  { to: '/transactions', label: 'Txns', Icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', Icon: PiggyBank },
]

const SPLITS_NAV = { to: '/splits', label: 'Splits', Icon: Users }
const SETTINGS_NAV = { to: '/settings', label: 'Settings', Icon: Settings }

export default function BottomNav() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const tabs = group?.splitEnabled
    ? [...BASE_NAV, SPLITS_NAV, SETTINGS_NAV]
    : [...BASE_NAV, SETTINGS_NAV]

  return (
    <nav
      className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] safe-bottom
                    border-t border-border bg-surface
                    flex items-center z-40"
    >
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            cn(
              'flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium transition-colors',
              isActive ? 'text-accent' : 'text-text-tertiary',
            )
          }
        >
          <Icon size={20} strokeWidth={1.75} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
