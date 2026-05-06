import { QrCode, RotateCcw, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import QRScanner from '@/components/sync/QRScanner'
import { Button } from '@/components/ui/button'
import { importIdentityBackup } from '@/sync/identity'
import { type InvitePayload, isInvite, parseAndVerifyInvite } from '@/sync/invite'

interface Props {
  onCreateSpace: () => void
  onRestoreIdentity: () => void
  onJoinSpace: (invite: InvitePayload) => void
}

export default function SpaceChoiceScreen({
  onCreateSpace,
  onRestoreIdentity,
  onJoinSpace,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreError, setRestoreError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [verifying, setVerifying] = useState(false)

  async function handleRestoreFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      await importIdentityBackup(file)
      onRestoreIdentity()
    } catch (err) {
      setRestoreError(`Restore failed: ${String(err)}`)
    }
  }

  async function handleScan(data: string) {
    if (verifying) return
    if (!isInvite(data)) {
      setScanError(
        "Not a valid Shillak invite QR — make sure you're scanning an invite, not a sync QR.",
      )
      return
    }
    setVerifying(true)
    setScanError('')
    try {
      const invite = await parseAndVerifyInvite(data)
      setScanning(false)
      onJoinSpace(invite)
    } catch (e) {
      setScanError(String(e))
      setVerifying(false)
    }
  }

  return (
    <div className="flex flex-col h-full px-6 py-8 gap-6">
      {scanning && (
        <QRScanner
          active={scanning}
          onScan={handleScan}
          onError={(e) => setScanError(e)}
          onClose={() => {
            setScanning(false)
            setScanError('')
            setVerifying(false)
          }}
        />
      )}

      <div>
        <h2 className="text-2xl font-bold text-text-primary">Your first space</h2>
        <p className="text-sm text-text-secondary mt-1">
          Create a new space or join an existing one.
        </p>
      </div>

      <div className="flex flex-col gap-4 mt-4">
        <Button
          variant="secondary"
          onClick={onCreateSpace}
          className="w-full p-5 h-auto rounded-2xl border border-border
                     flex items-start gap-4 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-accent-subtle flex items-center justify-center shrink-0">
            <Users size={20} className="text-accent" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Create a new space</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Household, family, partners — set up from scratch.
            </p>
          </div>
        </Button>

        <Button
          variant="secondary"
          onClick={() => {
            setScanError('')
            setVerifying(false)
            setScanning(true)
          }}
          className="w-full p-5 h-auto rounded-2xl border border-border
                     flex items-start gap-4 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <QrCode size={20} className="text-text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Join existing space</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Scan an invite QR from the space admin.
            </p>
          </div>
        </Button>

        {scanError && <p className="text-xs text-danger px-1 -mt-2">{scanError}</p>}

        <Button
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          className="w-full p-5 h-auto rounded-2xl border border-border
                     flex items-start gap-4 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-surface-2 flex items-center justify-center shrink-0">
            <RotateCcw size={20} className="text-text-secondary" />
          </div>
          <div>
            <p className="font-semibold text-text-primary">Restore from backup</p>
            <p className="text-sm text-text-secondary mt-0.5">
              Import a <span className="font-mono text-xs">.shillak-id</span> file to restore your
              identity on this device.
            </p>
          </div>
        </Button>

        {restoreError && <p className="text-xs text-danger px-1">{restoreError}</p>}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept=".shillak-id,application/json"
        onChange={handleRestoreFile}
        className="hidden"
      />
    </div>
  )
}
