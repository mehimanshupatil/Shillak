/**
 * 3-tab sync sheet:
 *   Tab 1 — Local WiFi (WebRTC via QR SDP exchange)
 *   Tab 2 — QR Batch (chunked carousel, unidirectional)
 *   Tab 3 — History (last SyncEvent records)
 */

import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Tabs, TabsList, TabsTab } from '@/components/ui/tabs'
import { db } from '@/db/db'
import { usePendingConflictsCount } from '@/hooks/usePendingConflictsCount'
import useAppStore from '@/stores/app.store'
import { classifyScan } from '@/sync/classifyScan'
import { useQrReceiver } from '@/sync/session/useQrReceiver'
import { useQrSender } from '@/sync/session/useQrSender'
import { useWifiSession } from '@/sync/session/useWifiSession'
import ConflictResolver from './ConflictResolver'
import HistoryTab from './tabs/HistoryTab'
import QRBatchTab from './tabs/QRBatchTab'
import type { Tab } from './tabs/types'
import WiFiTab from './tabs/WiFiTab'

interface Props {
  open: boolean
  onClose: () => void
}

export default function SyncSheet({ open, onClose }: Props) {
  const activeGroupId = useAppStore((s) => s.activeGroupId)
  const currentUserId = useAppStore((s) => s.currentUserId)

  const [tab, setTab] = useState<Tab>('wifi')

  const group = useLiveQuery(
    () => (activeGroupId ? db.groups.get(activeGroupId) : undefined),
    [activeGroupId],
  )

  const syncHistory = useLiveQuery(
    () =>
      activeGroupId
        ? db.syncEvents
            .where((e) => e.groupId === activeGroupId)
            .then((evts) => evts.sort((a, b) => b.syncedAt - a.syncedAt).slice(0, 10))
        : [],
    [activeGroupId],
  )

  const pendingConflictsCount = usePendingConflictsCount(activeGroupId)

  const lastSync = useLiveQuery(async () => {
    if (!activeGroupId) return null
    const events = await db.syncEvents.where(
      (e) => e.groupId === activeGroupId && e.status === 'ok',
    )
    return events.sort((a, b) => b.syncedAt - a.syncedAt)[0] ?? null
  }, [activeGroupId])

  // ── WiFi ─────────────────────────────────────────────────────────────────────

  const wifiSession = useWifiSession({
    groupId: activeGroupId,
    currentUserId,
    groupSecret: group?.groupSecret,
  })

  const wifiDone = wifiSession.state.step === 'done' ? wifiSession.state.conflicts : 0
  useEffect(() => {
    if (wifiDone > 0) setTab('history')
  }, [wifiDone])

  // ── QR Batch ─────────────────────────────────────────────────────────────────

  const sender = useQrSender({
    groupId: activeGroupId,
    currentUserId,
    groupSecret: group?.groupSecret,
  })

  // Receiver: the whole role is a tested machine now — this only wires it up.
  const receiver = useQrReceiver({
    groupId: activeGroupId,
    currentUserId,
    groupSecret: group?.groupSecret,
  })

  // Landing on History when a sync raises conflicts is navigation, not protocol,
  // so it stays out here rather than inside the machine.
  const receiverStep = receiver.state.step
  const receiverConflicts = receiver.state.step === 'done' ? receiver.state.conflicts : 0
  useEffect(() => {
    if (receiverStep === 'done' && receiverConflicts > 0) setTab('history')
  }, [receiverStep, receiverConflicts])

  function handleQRReset() {
    receiver.reset()
    sender.reset()
  }

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent
        className="w-full max-w-[430px] mx-auto rounded-t-2xl bg-surface
                   border-0 border-t border-border px-0 pb-0 gap-0 max-h-[92%] overflow-y-auto"
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-surface-3" />
        </div>

        <DrawerHeader className="px-4 pb-3 text-left">
          <DrawerTitle className="text-lg font-bold text-text-primary">Sync</DrawerTitle>
          <p className="text-xs text-text-tertiary">
            {group?.name}
            {lastSync && (
              <>
                {' · '}last synced{' '}
                {new Date(lastSync.syncedAt).toLocaleDateString('en-IN', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </>
            )}
          </p>
        </DrawerHeader>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mx-4 mb-4">
          <TabsList>
            {(['wifi', 'qr', 'history'] as const).map((t) => (
              <TabsTab key={t} value={t}>
                {t === 'wifi' ? 'Local WiFi' : t === 'qr' ? 'QR Code' : 'History'}
                {t === 'history' && (pendingConflictsCount ?? 0) > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warning" />
                )}
              </TabsTab>
            ))}
          </TabsList>
        </Tabs>

        {/* Pending conflicts — shown above tab content so always visible */}
        {(pendingConflictsCount ?? 0) > 0 && activeGroupId && (
          <div className="px-4 mb-4">
            <ConflictResolver groupId={activeGroupId} />
          </div>
        )}

        <div className="px-4 pb-8">
          {tab === 'wifi' && (
            <WiFiTab
              session={wifiSession.state}
              onStartOffer={wifiSession.offer}
              onReadyToScanAnswer={wifiSession.readyForAnswer}
              onScanAnswer={(scanned) => wifiSession.scanned(classifyScan(scanned))}
              onStartScanOffer={wifiSession.scanOffer}
              onScanOffer={(scanned) => wifiSession.scanned(classifyScan(scanned))}
              onReset={wifiSession.reset}
            />
          )}
          {tab === 'qr' && (
            <QRBatchTab
              sender={sender.state}
              receiver={receiver.state}
              onSenderStart={sender.start}
              onClockScan={(scanned) => sender.scanned(classifyScan(scanned))}
              onReceiverStart={receiver.start}
              onReceiverScanStart={receiver.beginScanning}
              onChunkScan={(scanned) => receiver.scanned(classifyScan(scanned))}
              onPrevChunk={() =>
                sender.showChunk(sender.state.step === 'showing-data' ? sender.state.index - 1 : 0)
              }
              onNextChunk={() =>
                sender.showChunk(sender.state.step === 'showing-data' ? sender.state.index + 1 : 0)
              }
              onReset={handleQRReset}
            />
          )}
          {tab === 'history' && <HistoryTab events={syncHistory ?? []} />}
        </div>
      </DrawerContent>
    </Drawer>
  )
}

// ─── Step indicator ───────────────────────────────────────────────────────────
