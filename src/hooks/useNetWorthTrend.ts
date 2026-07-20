import { useQuery } from '@tanstack/react-query'
import { computeNetWorthTrend } from '@/lib/netWorthTrend'

const FIVE_MINUTES = 5 * 60 * 1000

export function useNetWorthTrend(groupId: string | null, currency: string) {
  return useQuery({
    queryKey: ['netWorthTrend', groupId],
    queryFn: () => computeNetWorthTrend(groupId as string, currency),
    enabled: groupId !== null,
    staleTime: FIVE_MINUTES,
  })
}
