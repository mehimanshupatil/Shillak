import { useState } from 'react'
import useAppStore from '@/stores/app.store'
import type { InvitePayload } from '@/sync/invite'
import CreateSpaceScreen from './CreateSpaceScreen'
import JoinSpacePreviewScreen from './JoinSpacePreviewScreen'
import SpaceChoiceScreen from './SpaceChoiceScreen'

type Step = 'choice' | 'create-group' | 'join-preview'

export default function NoSpaceScreen() {
  const currentUserId = useAppStore((s) => s.currentUserId)
  const setActiveGroupId = useAppStore((s) => s.setActiveGroupId)
  const [step, setStep] = useState<Step>('choice')
  const [pendingInvite, setPendingInvite] = useState<InvitePayload | null>(null)

  if (!currentUserId) return null

  return (
    <div className="app-shell safe-top safe-bottom">
      {step === 'choice' && (
        <SpaceChoiceScreen
          onCreateSpace={() => setStep('create-group')}
          onJoinSpace={(invite) => {
            setPendingInvite(invite)
            setStep('join-preview')
          }}
        />
      )}
      {step === 'create-group' && (
        <CreateSpaceScreen
          userId={currentUserId}
          onComplete={(groupId) => setActiveGroupId(groupId)}
        />
      )}
      {step === 'join-preview' && pendingInvite && (
        <JoinSpacePreviewScreen
          invite={pendingInvite}
          userId={currentUserId}
          onComplete={() => setActiveGroupId(pendingInvite.groupId)}
          onBack={() => {
            setPendingInvite(null)
            setStep('choice')
          }}
        />
      )}
    </div>
  )
}
