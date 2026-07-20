import { useQuery } from '@tanstack/react-query'
import { computeUpcomingBills } from '@/lib/upcomingBills'

export function useUpcomingBills(groupId: string | null, currency: string) {
  return useQuery({
    queryKey: ['upcomingBills', groupId],
    queryFn: () => computeUpcomingBills(groupId as string, currency),
    enabled: groupId !== null,
  })
}
