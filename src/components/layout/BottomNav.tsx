import {
  ArrowsLeftRightIcon,
  GearIcon,
  PiggyBankIcon,
  SquaresFourIcon,
} from '@phosphor-icons/react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/', label: 'Home', Icon: SquaresFourIcon },
  { to: '/transactions', label: 'Txns', Icon: ArrowsLeftRightIcon },
  { to: '/budgets', label: 'Budgets', Icon: PiggyBankIcon },
  { to: '/settings', label: 'Settings', Icon: GearIcon },
]

export default function BottomNav() {
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
