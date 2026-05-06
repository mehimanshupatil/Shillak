/**
 * Shared avatar component — shows lucide icon on color background,
 * or falls back to the first letter of the name when no icon is set.
 */

import {
  Bird,
  Bot,
  Briefcase,
  Building2,
  Cat,
  Coins,
  Crown,
  Dog,
  DollarSign,
  Flame,
  Globe,
  Heart,
  Home,
  Key,
  Leaf,
  type LucideIcon,
  Music,
  PiggyBank,
  Rocket,
  ShoppingCart,
  Smile,
  Sparkles,
  Star,
  TreePine,
  TrendingUp,
  User,
  Users,
  Wallet,
  Zap,
} from 'lucide-react'

const AVATAR_ICON_MAP: Record<string, LucideIcon> = {
  Home,
  Users,
  Heart,
  Globe,
  Briefcase,
  DollarSign,
  TrendingUp,
  ShoppingCart,
  Leaf,
  Star,
  Sparkles,
  Key,
  Building2,
  Wallet,
  PiggyBank,
  TreePine,
  Coins,
  User,
  Smile,
  Zap,
  Flame,
  Crown,
  Rocket,
  Bot,
  Cat,
  Dog,
  Bird,
  Music,
}

export const SPACE_ICONS = [
  'Home',
  'Users',
  'Heart',
  'Globe',
  'Briefcase',
  'DollarSign',
  'TrendingUp',
  'ShoppingCart',
  'Leaf',
  'Star',
  'Sparkles',
  'Key',
  'Building2',
  'Wallet',
  'PiggyBank',
  'TreePine',
]

export const PROFILE_ICONS = [
  'User',
  'Smile',
  'Star',
  'Zap',
  'Flame',
  'Crown',
  'Rocket',
  'Bot',
  'Cat',
  'Dog',
  'Bird',
  'Music',
  'Heart',
  'Sparkles',
  'Globe',
  'Coins',
]

interface AvatarProps {
  color: string
  name: string
  icon?: string
  size?: number
  rounded?: 'full' | 'xl' | 'lg'
}

export function Avatar({ color, name, icon, size = 36, rounded = 'xl' }: AvatarProps) {
  const radiusClass =
    rounded === 'full' ? 'rounded-full' : rounded === 'xl' ? 'rounded-xl' : 'rounded-lg'
  const Icon = icon ? (AVATAR_ICON_MAP[icon] ?? null) : null
  const iconSize = Math.round(size * 0.48)

  return (
    <div
      className={`${radiusClass} flex items-center justify-center shrink-0 select-none`}
      style={{ backgroundColor: color, width: size, height: size }}
      role="img"
      aria-label={name}
    >
      {Icon ? (
        <Icon size={iconSize} color="white" strokeWidth={2} />
      ) : (
        <span
          style={{
            fontSize: Math.round(size * 0.42),
            lineHeight: 1,
            color: 'white',
            fontWeight: 600,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}

interface IconPickerProps {
  icons: string[]
  selected: string | undefined
  onSelect: (icon: string | undefined) => void
}

export function IconPicker({ icons, selected, onSelect }: IconPickerProps) {
  return (
    <div className="flex gap-2 flex-wrap">
      {icons.map((iconName) => {
        const Icon = AVATAR_ICON_MAP[iconName]
        if (!Icon) return null
        const active = selected === iconName
        return (
          <button
            key={iconName}
            type="button"
            onClick={() => onSelect(active ? undefined : iconName)}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              active
                ? 'bg-accent/20 ring-2 ring-accent scale-110'
                : 'bg-surface-2 hover:bg-surface-3'
            }`}
          >
            <Icon
              size={18}
              className={active ? 'text-accent' : 'text-text-secondary'}
              strokeWidth={1.75}
            />
          </button>
        )
      })}
    </div>
  )
}
