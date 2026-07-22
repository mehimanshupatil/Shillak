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
  VaultIcon,
  WrenchIcon,
} from '@phosphor-icons/react'

const ICON_MAP: Record<string, Icon> = {
  ShoppingCart: ShoppingCartIcon,
  Home: HouseIcon,
  Car: CarIcon,
  CreditCard: CreditCardIcon,
  Zap: LightningIcon,
  HeartPulse: HeartbeatIcon,
  Tv: TelevisionIcon,
  Utensils: ForkKnifeIcon,
  ShoppingBag: ShoppingBagIcon,
  BookOpen: BookOpenIcon,
  Shield: ShieldIcon,
  Fuel: GasPumpIcon,
  Wrench: WrenchIcon,
  Sparkles: SparkleIcon,
  Vault: VaultIcon,
  CircleDot: RadioButtonIcon,
  Briefcase: BriefcaseIcon,
  Laptop: LaptopIcon,
  TrendingUp: TrendUpIcon,
  PlusCircle: PlusCircleIcon,
  ArrowLeftRight: ArrowsLeftRightIcon,
  Coffee: CoffeeIcon,
  Music: MusicNoteIcon,
  Plane: AirplaneTiltIcon,
  Gift: GiftIcon,
  DollarSign: CurrencyDollarIcon,
  GraduationCap: GraduationCapIcon,
  Bike: BicycleIcon,
  Camera: CameraIcon,
  Package: PackageIcon,
  Scissors: ScissorsIcon,
  Smartphone: DeviceMobileIcon,
  Film: FilmStripIcon,
  Pizza: PizzaIcon,
  Baby: BabyIcon,
  Globe: GlobeIcon,
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
