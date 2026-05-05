interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// Captured once at module level — shared across all hook consumers via pub/sub
let _deferred: BeforeInstallPromptEvent | null = null
const _listeners = new Set<(e: BeforeInstallPromptEvent | null) => void>()

function broadcast(e: BeforeInstallPromptEvent | null) {
  _deferred = e
  for (const l of _listeners) l(e)
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    broadcast(e as BeforeInstallPromptEvent)
  })
  window.addEventListener('appinstalled', () => broadcast(null))
}

import { useEffect, useState } from 'react'

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(_deferred)
  const isStandalone =
    typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches

  useEffect(() => {
    _listeners.add(setPrompt)
    return () => {
      _listeners.delete(setPrompt)
    }
  }, [])

  async function install(): Promise<boolean> {
    if (!prompt) return false
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    if (outcome === 'accepted') broadcast(null)
    return outcome === 'accepted'
  }

  return {
    canInstall: !!prompt && !isStandalone,
    install,
  }
}
