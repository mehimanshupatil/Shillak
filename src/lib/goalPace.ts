import type { SavingsGoal } from '@/db/schema'

export type GoalPaceStatus = 'done' | 'overdue' | 'behind' | 'on-track'

export interface GoalPace {
  status: GoalPaceStatus
  /** What must be set aside per month to still make the deadline. Null when moot. */
  monthlyNeeded: number | null
}

const MS_PER_MONTH = 30.44 * 86_400_000

/** Amount progress may trail time progress by this much before it reads as behind. */
const TOLERANCE = 0.05

/**
 * How a SavingsGoal is tracking against its deadline.
 *
 * `today` is a midnight-UTC date and is compared against a deadline that is also
 * midnight UTC — so a goal is not overdue until the day *after* its deadline.
 * Comparing a wall-clock instant against a midnight date, as this used to, tipped
 * a goal to overdue the moment its deadline day began.
 *
 * Returns null for a goal with no deadline that isn't finished yet: there is no
 * pace to be on or off.
 */
export function goalPace(
  goal: Pick<SavingsGoal, 'target' | 'deadline' | 'createdAt'>,
  saved: number,
  today: number,
): GoalPace | null {
  if (saved >= goal.target) return { status: 'done', monthlyNeeded: null }
  if (!goal.deadline) return null
  if (today > goal.deadline) return { status: 'overdue', monthlyNeeded: null }

  const monthsRemaining = (goal.deadline - today) / MS_PER_MONTH
  const monthlyNeeded =
    monthsRemaining > 0 ? Math.ceil((goal.target - saved) / monthsRemaining) : null

  const totalDuration = goal.deadline - goal.createdAt
  const timeProgress = totalDuration > 0 ? (today - goal.createdAt) / totalDuration : 0
  const amountProgress = goal.target > 0 ? saved / goal.target : 0

  return {
    status: amountProgress >= timeProgress - TOLERANCE ? 'on-track' : 'behind',
    monthlyNeeded,
  }
}
