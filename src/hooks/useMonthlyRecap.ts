import { useQuery } from '@tanstack/react-query'
import { computeMonthlyRecap } from '@/lib/monthlyRecap'

export function useMonthlyRecap(
  groupId: string | null,
  currency: string,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: ['monthlyRecap', groupId, year, month],
    queryFn: () => computeMonthlyRecap(groupId as string, currency, year, month),
    enabled: groupId !== null,
  })
}
