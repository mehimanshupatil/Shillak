import { useLiveQuery } from 'dexie-react-hooks'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { db } from '@/db/db'
import CreateGroupScreen from '@/pages/Onboarding/CreateGroupScreen'
import useAppStore from '@/stores/app.store'

export default function GroupSwitcher() {
  const [createOpen, setCreateOpen] = useState(false)
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const setActiveGroupId = useAppStore((s) => s.setActiveGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const groups = useLiveQuery(() => db.groups.where((g) => g.status === 'active'), [])

  function handleGroupCreated(groupId: string) {
    setActiveGroupId(groupId)
    setCreateOpen(false)
  }

  return (
    <>
      <div className="flex gap-2 overflow-x-auto scrollbar-none">
        {(groups ?? []).map((g) => {
          const active = g.groupId === activeGroupId
          return (
            <button
              key={g.groupId}
              type="button"
              onClick={() => setActiveGroupId(g.groupId)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                active ? 'text-black scale-105' : 'bg-surface-2 text-text-secondary'
              }`}
              style={active ? { backgroundColor: g.avatarColor } : {}}
            >
              {g.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="Create new group"
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full
                     bg-surface-2 text-text-secondary"
        >
          <Plus size={14} />
        </button>
      </div>

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-bg
                     border-0 border-t border-border h-[90vh] px-0 pb-0 gap-0"
        >
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-10 h-1 rounded-full bg-border" />
          </div>
          <div className="overflow-y-auto h-full">
            {currentUserId && (
              <CreateGroupScreen userId={currentUserId} onComplete={handleGroupCreated} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
