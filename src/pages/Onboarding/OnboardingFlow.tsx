import { useState } from 'react'
import CreateGroupScreen from './CreateGroupScreen'
import CreateProfileScreen from './CreateProfileScreen'
import GroupChoiceScreen from './GroupChoiceScreen'
import WelcomeScreen from './WelcomeScreen'

type Step = 'welcome' | 'profile' | 'choice' | 'create-group' | 'restore'

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
        <GroupChoiceScreen
          onCreateGroup={() => setStep('create-group')}
          onRestoreIdentity={onRestoreIdentity}
        />
      )}
      {step === 'create-group' && profile && (
        <CreateGroupScreen
          userId={profile.userId}
          onComplete={(groupId) => onComplete(profile.userId, groupId)}
        />
      )}
    </div>
  )
}
