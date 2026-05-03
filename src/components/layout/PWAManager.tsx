import { useRegisterSW } from 'virtual:pwa-register/react'
import { Download, RefreshCw, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function PWAManager() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, _r) {
      // SW registered
    },
  })

  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installDismissed, setInstallDismissed] = useState(false)
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const onOffline = () => setIsOffline(true)
    const onOnline = () => setIsOffline(false)
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setInstallPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function handleInstall() {
    if (!installPrompt) return
    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
    else setInstallDismissed(true)
  }

  const showUpdate = needRefresh && !updateDismissed
  const showInstall = !!installPrompt && !installDismissed && !showUpdate

  return (
    <>
      {/* Offline indicator */}
      {isOffline && (
        <div className="fixed top-0 inset-x-0 z-50 flex justify-center pointer-events-none">
          <div
            className="mx-auto max-w-[430px] w-full px-4 py-2 flex items-center gap-2
                       bg-surface-2 border-b border-border
                       text-text-secondary text-xs"
          >
            <WifiOff size={12} />
            <span>You're offline — data still available</span>
          </div>
        </div>
      )}

      {/* Update banner */}
      {showUpdate && (
        <div className="fixed bottom-20 inset-x-0 z-50 flex justify-center px-4">
          <div
            className="w-full max-w-[430px] flex items-center gap-3 px-4 py-3
                       bg-surface-2 border border-accent
                       rounded-2xl shadow-lg text-sm"
          >
            <RefreshCw size={16} className="text-accent shrink-0" />
            <span className="flex-1 text-text-primary">New version available</span>
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="px-3 py-1.5 rounded-xl bg-accent text-black text-xs font-semibold"
            >
              Update
            </button>
            <button
              type="button"
              onClick={() => setUpdateDismissed(true)}
              className="text-text-tertiary"
              aria-label="Dismiss update"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Install prompt */}
      {showInstall && (
        <div className="fixed bottom-20 inset-x-0 z-50 flex justify-center px-4">
          <div
            className="w-full max-w-[430px] flex items-center gap-3 px-4 py-3
                       bg-surface-2 border border-border
                       rounded-2xl shadow-lg text-sm"
          >
            <Download size={16} className="text-accent shrink-0" />
            <span className="flex-1 text-text-primary">Add Shillak to home screen</span>
            <button
              type="button"
              onClick={handleInstall}
              className="px-3 py-1.5 rounded-xl bg-accent text-black text-xs font-semibold"
            >
              Install
            </button>
            <button
              type="button"
              onClick={() => setInstallDismissed(true)}
              className="text-text-tertiary"
              aria-label="Dismiss install prompt"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Extend Window for beforeinstallprompt
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
