import {
  AirplaneTiltIcon,
  ArrowsLeftRightIcon,
  BabyIcon,
  BarbellIcon,
  BicycleIcon,
  BookOpenIcon,
  BriefcaseIcon,
  CameraIcon,
  CarIcon,
  CoffeeIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  DeviceMobileIcon,
  FilmStripIcon,
  ForkKnifeIcon,
  GasPumpIcon,
  GiftIcon,
  GlobeIcon,
  GraduationCapIcon,
  HeartbeatIcon,
  HouseIcon,
  type Icon,
  LaptopIcon,
  LightningIcon,
  MusicNoteIcon,
  PackageIcon,
  PizzaIcon,
  PlusCircleIcon,
  RadioButtonIcon,
  ScissorsIcon,
  ShieldIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparkleIcon,
  TelevisionIcon,
  TrendUpIcon,
  WrenchIcon,
} from '@phosphor-icons/react'

const ICON_MAP: Record<string, Icon> = {
  ShoppingCartIcon,
  Home: HouseIcon,
  CarIcon,
  CreditCardIcon,
  Zap: LightningIcon,
  HeartPulse: HeartbeatIcon,
  Tv: TelevisionIcon,
  Utensils: ForkKnifeIcon,
  ShoppingBagIcon,
  BookOpenIcon,
  ShieldIcon,
  Fuel: GasPumpIcon,
  WrenchIcon,
  Sparkles: SparkleIcon,
  CircleDot: RadioButtonIcon,
  BriefcaseIcon,
  LaptopIcon,
  TrendingUp: TrendUpIcon,
  PlusCircleIcon,
  ArrowLeftRight: ArrowsLeftRightIcon,
  CoffeeIcon,
  Music: MusicNoteIcon,
  Plane: AirplaneTiltIcon,
  GiftIcon,
  DollarSign: CurrencyDollarIcon,
  GraduationCapIcon,
  Bike: BicycleIcon,
  CameraIcon,
  PackageIcon,
  ScissorsIcon,
  Smartphone: DeviceMobileIcon,
  Film: FilmStripIcon,
  PizzaIcon,
  BabyIcon,
  GlobeIcon,
  Dumbbell: BarbellIcon,
}

export const ICON_OPTIONS = Object.keys(ICON_MAP)

interface Props {
  icon: string
  color: string
  size?: number
  /** Container size in px — renders a rounded square bg behind the icon */
  containerSize?: number
}

export default function CategoryIcon({ icon, color, size = 16, containerSize = 36 }: Props) {
  const Icon = ICON_MAP[icon] ?? RadioButtonIcon

  // containerSize=0 → bare icon, no wrapper (for inline use in pills)
  if (containerSize === 0) {
    return <Icon size={size} color={color} strokeWidth={1.75} />
  }

  return (
    <div
      className="flex items-center justify-center rounded-xl shrink-0"
      style={{
        width: containerSize,
        height: containerSize,
        backgroundColor: `${color}22`,
      }}
    >
      <Icon size={size} color={color} strokeWidth={1.75} />
    </div>
  )
}
