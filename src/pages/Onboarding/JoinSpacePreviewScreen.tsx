import { ArrowLeftIcon, UsersIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type InvitePayload, joinGroupFromInvite } from '@/sync/invite'

interface Props {
  invite: InvitePayload
  userId: string
  onComplete: () => void
  onBack: () => void
}

export default function JoinSpacePreviewScreen({ invite, userId, onComplete, onBack }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleJoin() {
    setLoading(true)
    setError('')
    try {
      await joinGroupFromInvite(invite, userId)
      onComplete()
    } catch (e) {
      setError(String(e))
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full px-6 py-8 gap-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-text-secondary -ml-1 w-fit"
      >
        <ArrowLeftIcon size={16} />
        Back
      </button>

      <div>
        <h2 className="text-2xl font-bold text-text-primary">Join space</h2>
        <p className="text-sm text-text-secondary mt-1">{"You've been invited to join a space."}</p>
      </div>

      {/* Space preview card */}
      <div className="rounded-2xl bg-surface border border-border p-5 flex items-center gap-4">
        <div
          className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center"
          style={{ backgroundColor: invite.groupColor }}
        >
          <UsersIcon size={24} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-bold text-text-primary truncate">{invite.groupName}</p>
          <p className="text-sm text-text-secondary mt-0.5">
            {invite.currency} · {invite.memberCount} member{invite.memberCount !== 1 ? 's' : ''}
          </p>
          <p className="text-xs text-text-tertiary mt-0.5">Invited by {invite.createdByName}</p>
        </div>
      </div>

      <div className="rounded-xl bg-surface-2 border border-border px-4 py-3">
        <p className="text-xs text-text-secondary leading-relaxed">
          Joining gives you access to this shared space. After joining, sync via{' '}
          <span className="text-text-primary">Settings → Sync</span> to get the full transaction
          history from the other device.
        </p>
      </div>

      {error && <p className="text-sm text-danger px-1">{error}</p>}

      <div className="mt-auto">
        <Button
          size="lg"
          onClick={handleJoin}
          disabled={loading}
          className="w-full rounded-2xl font-semibold"
        >
          {loading ? 'Joining…' : `Join ${invite.groupName}`}
        </Button>
      </div>
    </div>
  )
}
