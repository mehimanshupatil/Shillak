import { QrCode, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  onCreateGroup: () => void
}

export default function GroupChoiceScreen({ onCreateGroup }: Props) {
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
      </div>
    </div>
  )
}
