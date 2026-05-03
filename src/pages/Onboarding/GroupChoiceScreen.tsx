import { QrCode, RotateCcw, Users } from 'lucide-react'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { importIdentityBackup } from '@/sync/identity'

interface Props {
  onCreateGroup: () => void
  onRestoreIdentity: () => void
}

export default function GroupChoiceScreen({ onCreateGroup, onRestoreIdentity }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [restoreError, setRestoreError] = useState('')

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

  return (
    <div className="flex flex-col h-full px-6 py-8 gap-6">
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">Your first group</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Create a new group or join an existing one.
        </p>
      </div>

      <div className="flex flex-col gap-4 mt-4">
        <Button
          onClick={onCreateGroup}
          className="w-full p-5 h-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]
                     flex items-start gap-4 text-left active:bg-[var(--color-surface-2)] transition-colors
                     hover:bg-[var(--color-surface-2)]"
        >
          <div className="w-10 h-10 rounded-xl bg-[var(--color-accent-subtle)] flex items-center justify-center flex-shrink-0">
            <Users size={20} className="text-[var(--color-accent)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--color-text-primary)]">Create a new group</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
              Family budget, flatmates, trip — set up from scratch.
            </p>
          </div>
        </Button>

        <Button
          disabled
          className="w-full p-5 h-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]
                     flex items-start gap-4 text-left opacity-40 cursor-not-allowed"
        >
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center flex-shrink-0">
            <QrCode size={20} className="text-[var(--color-text-secondary)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--color-text-primary)]">Join existing group</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
              Scan a QR invite or import a file. Coming in Phase 3.
            </p>
          </div>
        </Button>

        <Button
          onClick={() => fileRef.current?.click()}
          className="w-full p-5 h-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)]
                     flex items-start gap-4 text-left active:bg-[var(--color-surface-2)] transition-colors
                     hover:bg-[var(--color-surface-2)]"
        >
          <div className="w-10 h-10 rounded-xl bg-[var(--color-surface-2)] flex items-center justify-center flex-shrink-0">
            <RotateCcw size={20} className="text-[var(--color-text-secondary)]" />
          </div>
          <div>
            <p className="font-semibold text-[var(--color-text-primary)]">Restore from backup</p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
              Import a <span className="font-mono text-xs">.shillak-id</span> file to restore your
              identity on this device.
            </p>
          </div>
        </Button>

        {restoreError && <p className="text-xs text-[var(--color-danger)] px-1">{restoreError}</p>}
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
