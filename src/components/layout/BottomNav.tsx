import {
  ArrowsLeftRightIcon,
  GearIcon,
  PiggyBankIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react'
import { NavLink } from 'react-router-dom'
import { usePendingConflictsCount } from '@/hooks/usePendingConflictsCount'
import { cn } from '@/lib/utils'
import useAppStore from '@/stores/app.store'

const tabs = [
  { to: '/', label: 'Home', Icon: SquaresFourIcon },
  { to: '/transactions', label: 'Txns', Icon: ArrowsLeftRightIcon },
  { to: '/budgets', label: 'Budgets', Icon: PiggyBankIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
]

export default function BottomNav() {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const pendingConflictsCount = usePendingConflictsCount(activeGroupId)

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
          <span className="relative">
            <Icon size={20} strokeWidth={1.75} />
            {to === '/settings' && pendingConflictsCount > 0 && (
              <span
                role="status"
                aria-label={`${pendingConflictsCount} pending conflict${pendingConflictsCount > 1 ? 's' : ''}`}
                className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger"
              />
            )}
          </span>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
