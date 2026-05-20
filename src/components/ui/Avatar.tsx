/**
 * Shared avatar component — shows lucide icon on color background,
 * or falls back to the first letter of the name when no icon is set.
 */

import {
  BirdIcon,
  BriefcaseIcon,
  BuildingsIcon,
  CatIcon,
  CoinsIcon,
  CrownIcon,
  CurrencyDollarIcon,
  DogIcon,
  FlameIcon,
  GlobeIcon,
  HeartIcon,
  HouseIcon,
  type Icon,
  KeyIcon,
  LeafIcon,
  LightningIcon,
  MusicNoteIcon,
  PiggyBankIcon,
  RobotIcon,
  RocketIcon,
  ShoppingCartIcon,
  SmileyIcon,
  SparkleIcon,
  StarIcon,
  TreeIcon,
  TrendUpIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from '@phosphor-icons/react'

const AVATAR_ICON_MAP: Record<string, Icon> = {
  Home: HouseIcon,
  UsersIcon,
  HeartIcon,
  GlobeIcon,
  BriefcaseIcon,
  DollarSign: CurrencyDollarIcon,
  TrendingUp: TrendUpIcon,
  ShoppingCartIcon,
  LeafIcon,
  StarIcon,
  Sparkles: SparkleIcon,
  KeyIcon,
  Building2: BuildingsIcon,
  WalletIcon,
  PiggyBankIcon,
  TreePine: TreeIcon,
  CoinsIcon,
  UserIcon,
  Smile: SmileyIcon,
  Zap: LightningIcon,
  FlameIcon,
  CrownIcon,
  RocketIcon,
  Bot: RobotIcon,
  CatIcon,
  DogIcon,
  BirdIcon,
  Music: MusicNoteIcon,
}

export const SPACE_ICONS = [
  'Home',
  'UsersIcon',
  'HeartIcon',
  'GlobeIcon',
  'BriefcaseIcon',
  'DollarSign',
  'TrendingUp',
  'ShoppingCartIcon',
  'LeafIcon',
  'StarIcon',
  'Sparkles',
  'KeyIcon',
  'Building2',
  'WalletIcon',
  'PiggyBankIcon',
  'TreePine',
]

export const PROFILE_ICONS = [
  'UserIcon',
  'Smile',
  'StarIcon',
  'Zap',
  'FlameIcon',
  'CrownIcon',
  'RocketIcon',
  'Bot',
  'CatIcon',
  'DogIcon',
  'BirdIcon',
  'Music',
  'HeartIcon',
  'Sparkles',
  'GlobeIcon',
  'CoinsIcon',
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
