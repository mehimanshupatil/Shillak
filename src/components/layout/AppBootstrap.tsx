import { type ReactNode, useEffect, useState } from 'react'
import { broadcastLock, initLockChannel } from '@/crypto/keystore'
import { db } from '@/db/db'
import { APP_LOCK_TIMEOUT_MS } from '@/lib/constants'
import { processRecurrences } from '@/lib/recurrences'
import OnboardingFlow from '@/pages/Onboarding/OnboardingFlow'
import PinScreen from '@/pages/Onboarding/PinScreen'
import useAppStore from '@/stores/app.store'
import useKeyStore from '@/stores/key.store'
import PWAManager from './PWAManager'
import StorageErrorScreen from './StorageErrorScreen'

type BootState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'onboarding' }
  | { status: 'locked' }
  | { status: 'ready' }

export default function AppBootstrap({ children }: { children: ReactNode }) {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' })
  const { key, clearKey } = useKeyStore()
  const setCurrentUserId = useAppStore((s) => s.setCurrentUserId)
  const setActiveGroupId = useAppStore((s) => s.setActiveGroupId)

  // ─── Boot sequence ──────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function boot() {
      try {
        await db.open()
      } catch (e) {
        if (!cancelled) setBoot({ status: 'error', message: String(e) })
        return
      }

      // Check keystore
      const ks = await db.keystoreTable.get(1)
      if (!ks) {
        if (!cancelled) setBoot({ status: 'onboarding' })
        return
      }

      // Key already in memory (e.g. hot reload in dev)
      if (useKeyStore.getState().key) {
        if (!cancelled) setBoot({ status: 'ready' })
        return
      }

      if (!cancelled) setBoot({ status: 'locked' })
    }

    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  // ─── Cross-tab lock sync ────────────────────────────────────────────────────
  useEffect(() => {
    const cleanup = initLockChannel(() => {
      clearKey()
      setBoot({ status: 'locked' })
    })
    return cleanup
  }, [clearKey])

  // ─── Page Visibility API — lock after timeout ───────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    function handleVisibility() {
      if (document.hidden) {
        timer = setTimeout(() => {
          clearKey()
          broadcastLock()
          setBoot({ status: 'locked' })
        }, APP_LOCK_TIMEOUT_MS)
      } else {
        if (timer) clearTimeout(timer)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      if (timer) clearTimeout(timer)
    }
  }, [clearKey])

  // ─── After onboarding completes ─────────────────────────────────────────────
  async function handleOnboardingComplete(userId: string, groupId: string) {
    setCurrentUserId(userId)
    setActiveGroupId(groupId)
    setBoot({ status: 'ready' })
  }

  // ─── After PIN unlock ────────────────────────────────────────────────────────
  async function handleUnlocked() {
    // Load user + active group from DB now that key is available
    const users = await db.users.toArray()
    const user = users[0]
    if (!user) {
      setBoot({ status: 'onboarding' })
      return
    }

    setCurrentUserId(user.userId)

    const groups = await db.groups.where((g) => g.status === 'active')
    const group = groups[0]
    if (group) {
      setActiveGroupId(group.groupId)
      void processRecurrences(group.groupId, user.userId)
    }

    setBoot({ status: 'ready' })
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  if (boot.status === 'loading') {
    return (
      <div className="app-shell flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (boot.status === 'error') {
    return <StorageErrorScreen message={boot.message} />
  }

  if (boot.status === 'onboarding') {
    return (
      <OnboardingFlow
        onComplete={handleOnboardingComplete}
        onRestoreIdentity={() => setBoot({ status: 'locked' })}
      />
    )
  }

  if (boot.status === 'locked' || !key) {
    return <PinScreen onUnlocked={handleUnlocked} />
  }

  return (
    <>
      <PWAManager />
      {children}
    </>
  )
}
