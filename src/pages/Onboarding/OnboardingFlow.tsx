import { useState } from 'react'
import type { InvitePayload } from '@/sync/invite'
import CreateSpaceScreen from './CreateSpaceScreen'
import CreateProfileScreen from './CreateProfileScreen'
import SpaceChoiceScreen from './SpaceChoiceScreen'
import JoinSpacePreviewScreen from './JoinSpacePreviewScreen'
import WelcomeScreen from './WelcomeScreen'

type Step = 'welcome' | 'profile' | 'choice' | 'create-group' | 'join-preview' | 'restore'

interface ProfileData {
  userId: string
  displayName: string
  avatarColor: string
}

interface Props {
  onComplete: (userId: string, groupId: string) => void
  onRestoreIdentity: () => void
}

export default function OnboardingFlow({ onComplete, onRestoreIdentity }: Props) {
  const [step, setStep] = useState<Step>('welcome')
  const [profile, setProfile] = useState<ProfileData | null>(null)
  const [pendingInvite, setPendingInvite] = useState<InvitePayload | null>(null)

  return (
    <div className="app-shell safe-top safe-bottom">
      {step === 'welcome' && <WelcomeScreen onNext={() => setStep('profile')} />}
      {step === 'profile' && (
        <CreateProfileScreen
          onNext={(p) => {
            setProfile(p)
            setStep('choice')
          }}
        />
      )}
      {step === 'choice' && profile && (
        <SpaceChoiceScreen
          onCreateSpace={() => setStep('create-group')}
          onRestoreIdentity={onRestoreIdentity}
          onJoinSpace={(invite) => {
            setPendingInvite(invite)
            setStep('join-preview')
          }}
        />
      )}
      {step === 'create-group' && profile && (
        <CreateSpaceScreen
          userId={profile.userId}
          onComplete={(groupId) => onComplete(profile.userId, groupId)}
        />
      )}
      {step === 'join-preview' && profile && pendingInvite && (
        <JoinSpacePreviewScreen
          invite={pendingInvite}
          userId={profile.userId}
          onComplete={() => onComplete(profile.userId, pendingInvite.groupId)}
          onBack={() => {
            setPendingInvite(null)
            setStep('choice')
          }}
        />
      )}
    </div>
  )
}
