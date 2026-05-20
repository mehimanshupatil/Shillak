/**
 * Admin-facing invite sheet.
 * Generates a signed invite QR that new members scan to join.
 * QR contains space info + group_secret + HMAC signature.
 * Valid for 24 hours.
 */
import { QrCodeIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import QRDisplay from '@/components/sync/QRDisplay'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { generateInvite } from '@/sync/invite'

interface Props {
  open: boolean
  onClose: () => void
  groupId: string
  userId: string
}

export default function InviteSheet({ open, onClose, groupId, userId }: Props) {
  const [qrData, setQrData] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!open) {
      setQrData(null)
      setError('')
      setFullscreen(false)
      return
    }
    setLoading(true)
    generateInvite(groupId, userId)
      .then((data) => {
        setQrData(data)
      })
      .catch((e: unknown) => {
        setError(`Failed to generate invite: ${String(e)}`)
      })
      .finally(() => setLoading(false))
  }, [open, groupId, userId])

  if (fullscreen && qrData) {
    return (
      <QRDisplay
        value={qrData}
        label="Show this QR to the person joining. Valid for 24 hours."
        onClose={() => setFullscreen(false)}
      />
    )
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="w-full max-w-[430px] mx-auto rounded-t-3xl bg-surface
                   border-0 border-t border-border safe-bottom px-0 pb-0 gap-0"
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        <div className="px-5 pb-8 flex flex-col gap-5">
          <SheetHeader className="p-0">
            <SheetTitle className="text-base font-semibold text-text-primary">
              Invite member
            </SheetTitle>
          </SheetHeader>

          <p className="text-sm text-text-secondary">
            Show this QR code to the person you want to add. They'll scan it in the Shillak app to
            join this space.
          </p>

          {loading && (
            <div className="flex items-center justify-center h-40">
              <div className="w-8 h-8 rounded-full border-2 border-border border-t-accent animate-spin" />
            </div>
          )}

          {error && <p className="text-sm text-danger px-1">{error}</p>}

          {qrData && !loading && (
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              className="w-full flex flex-col items-center gap-3 p-6 rounded-2xl
                         bg-white border border-border active:opacity-80 transition-opacity"
            >
              {/* Mini QR preview — tapping opens full-screen */}
              <QrCodeIcon size={80} className="text-black" />
              <p className="text-xs text-text-tertiary">Tap to show full-screen QR</p>
            </button>
          )}

          <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
            <p className="text-xs text-text-secondary leading-relaxed">
              <span className="text-text-primary font-medium">Expires in 24 hours.</span> The QR
              contains the space's sync key — share only with trusted members. Generate a new one
              for each person.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
