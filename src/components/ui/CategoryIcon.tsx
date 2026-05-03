import {
  ArrowLeftRight,
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  CircleDot,
  Coffee,
  CreditCard,
  DollarSign,
  Dumbbell,
  Film,
  Fuel,
  Gift,
  Globe,
  GraduationCap,
  HeartPulse,
  Home,
  Laptop,
  type LucideIcon,
  Music,
  Package,
  Pizza,
  Plane,
  PlusCircle,
  Scissors,
  Shield,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
  Tv,
  Utensils,
  Wrench,
  Zap,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  ShoppingCart,
  Home,
  Car,
  CreditCard,
  Zap,
  HeartPulse,
  Tv,
  Utensils,
  ShoppingBag,
  BookOpen,
  Shield,
  Fuel,
  Wrench,
  Sparkles,
  CircleDot,
  Briefcase,
  Laptop,
  TrendingUp,
  PlusCircle,
  ArrowLeftRight,
  Coffee,
  Music,
  Plane,
  Gift,
  DollarSign,
  GraduationCap,
  Bike,
  Camera,
  Package,
  Scissors,
  Smartphone,
  Film,
  Pizza,
  Baby,
  Globe,
  Dumbbell,
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
  const Icon = ICON_MAP[icon] ?? CircleDot

  // containerSize=0 → bare icon, no wrapper (for inline use in pills)
  if (containerSize === 0) {
    return <Icon size={size} color={color} strokeWidth={1.75} />
  }

  return (
    <div
      className="flex items-center justify-center rounded-xl flex-shrink-0"
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
