import { PlusIcon, QrCodeIcon, UsersIcon } from '@phosphor-icons/react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import QRScanner from '@/components/sync/QRScanner'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { db } from '@/db/db'
import CreateSpaceScreen from '@/pages/Onboarding/CreateSpaceScreen'
import JoinSpacePreviewScreen from '@/pages/Onboarding/JoinSpacePreviewScreen'
import useAppStore from '@/stores/app.store'
import { type InvitePayload, isInvite, parseAndVerifyInvite } from '@/sync/invite'

type SheetView = 'choice' | 'create' | 'scan' | 'join-preview'

export default function SpaceSwitcher() {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [view, setView] = useState<SheetView>('choice')
  const [pendingInvite, setPendingInvite] = useState<InvitePayload | null>(null)
  const [scanError, setScanError] = useState('')
  const [verifying, setVerifying] = useState(false)

  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const setActiveGroupId = useAppStore((s) => s.setActiveGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const groups = useLiveQuery(() => db.groups.where((g) => g.status === 'active'), [])

  function openSheet() {
    setView('choice')
    setScanError('')
    setVerifying(false)
    setPendingInvite(null)
    setSheetOpen(true)
  }

  function handleSpaceCreated(groupId: string) {
    setActiveGroupId(groupId)
    setSheetOpen(false)
  }

  function handleJoinComplete(groupId: string) {
    setActiveGroupId(groupId)
    setSheetOpen(false)
  }

  async function handleScan(data: string) {
    if (verifying) return
    if (!isInvite(data)) {
      setScanError('Not a valid Shillak invite QR.')
      return
    }
    setVerifying(true)
    setScanError('')
    try {
      const invite = await parseAndVerifyInvite(data)
      setPendingInvite(invite)
      setView('join-preview')
    } catch (e) {
      setScanError(String(e))
      setVerifying(false)
    }
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
              className={`shrink-0 flex items-center gap-2 pl-1 pr-3 py-1 rounded-full text-xs font-semibold transition-all ${
                active ? 'text-black scale-105' : 'bg-surface-2 text-text-secondary'
              }`}
              style={active ? { backgroundColor: g.avatarColor } : {}}
            >
              <Avatar
                color={g.avatarColor}
                name={g.name}
                icon={g.avatarIcon}
                size={22}
                rounded="full"
              />
              {g.name}
            </button>
          )
        })}
        <button
          type="button"
          onClick={openSheet}
          aria-label="Add space"
          className="shrink-0 flex items-center justify-center w-7 h-7 rounded-full
                     bg-surface-2 text-text-secondary"
        >
          <PlusIcon size={14} />
        </button>
      </div>

      {/* Scanner lives outside Sheet so it can go full-screen */}
      {view === 'scan' && sheetOpen && (
        <QRScanner
          active
          onScan={handleScan}
          onError={(e) => setScanError(e)}
          onClose={() => {
            setView('choice')
            setScanError('')
            setVerifying(false)
          }}
        />
      )}

      <Sheet open={sheetOpen && view !== 'scan'} onOpenChange={(v) => !v && setSheetOpen(false)}>
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
            {view === 'choice' && (
              <div className="px-6 py-4 flex flex-col gap-4">
                <SheetHeader className="p-0">
                  <SheetTitle className="text-base font-semibold text-text-primary">
                    Add space
                  </SheetTitle>
                </SheetHeader>

                <Button
                  variant="secondary"
                  onClick={() => setView('create')}
                  className="w-full p-5 h-auto rounded-2xl border border-border
                             flex items-start gap-4 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
                    <UsersIcon size={20} className="text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">Create new space</p>
                    <p className="text-sm text-text-secondary mt-0.5">
                      Household, family, or partners — set up from scratch.
                    </p>
                  </div>
                </Button>

                <Button
                  variant="secondary"
                  onClick={() => {
                    setScanError('')
                    setVerifying(false)
                    setView('scan')
                  }}
                  className="w-full p-5 h-auto rounded-2xl border border-border
                             flex items-start gap-4 text-left"
                >
                  <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
                    <QrCodeIcon size={20} className="text-text-secondary" />
                  </div>
                  <div>
                    <p className="font-semibold text-text-primary">Join existing space</p>
                    <p className="text-sm text-text-secondary mt-0.5">
                      ScanIcon an invite QR from the space admin.
                    </p>
                  </div>
                </Button>

                {scanError && <p className="text-xs text-danger px-1">{scanError}</p>}
              </div>
            )}

            {view === 'create' && currentUserId && (
              <CreateSpaceScreen userId={currentUserId} onComplete={handleSpaceCreated} />
            )}

            {view === 'join-preview' && currentUserId && pendingInvite && (
              <JoinSpacePreviewScreen
                invite={pendingInvite}
                userId={currentUserId}
                onComplete={() => handleJoinComplete(pendingInvite.groupId)}
                onBack={() => {
                  setPendingInvite(null)
                  setView('choice')
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
