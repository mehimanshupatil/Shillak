/**
 * Camera QR scanner using html5-qrcode.
 * Calls onScan(result) once per unique decoded value.
 * Calls onError if camera permission denied.
 */
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { useEffect, useId, useRef } from 'react'

interface Props {
  onScan: (result: string) => void
  onError?: (err: string) => void
  active?: boolean
}

export default function QRScanner({ onScan, onError, active = true }: Props) {
  // useId gives a unique, stable ID per component instance — avoids DOM conflicts
  // on re-mount (tab switching, strict mode double-invoke, etc.)
  const rawId = useId()
  const scannerId = `qr-${rawId.replace(/:/g, '')}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScanRef = useRef<string>('')

  useEffect(() => {
    if (!active) return

    // Small delay — lets React finish painting the div into the DOM
    const tid = setTimeout(() => {
      const scanner = new Html5Qrcode(scannerId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      })
      scannerRef.current = scanner

      scanner
        .start(
          { facingMode: 'environment' },
          { fps: 15, qrbox: { width: 192, height: 192 } },
          (text) => {
            if (text === lastScanRef.current) return
            lastScanRef.current = text
            onScan(text)
            setTimeout(() => {
              lastScanRef.current = ''
            }, 2000)
          },
          () => {
            // per-frame decode errors are noise — ignore
          },
        )
        .catch((err: unknown) => {
          onError?.(String(err))
        })
    }, 100)

    return () => {
      clearTimeout(tid)
      scannerRef.current?.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [active, scannerId, onScan, onError])

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      {/* Container forces html5-qrcode to fill a square we control.
          html5-qrcode injects video/canvas with inline width/height — override them. */}
      <style
        // biome-ignore lint/security/noDangerouslySetInnerHtml: scoped CSS override for html5-qrcode video fill
        dangerouslySetInnerHTML={{
          __html: `
            #${scannerId} video,
            #${scannerId} canvas { width: 100% !important; height: 100% !important; object-fit: cover; }
            #${scannerId} > div { width: 100% !important; height: 100% !important; }
          `,
        }}
      />
      <div className="relative w-full max-w-[320px] aspect-square rounded-2xl overflow-hidden bg-black">
        <div id={scannerId} className="absolute inset-0" />
        {/* Scan-area overlay: corner brackets */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative w-48 h-48">
            {/* TL */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-accent rounded-tl-sm" />
            {/* TR */}
            <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-accent rounded-tr-sm" />
            {/* BL */}
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-accent rounded-bl-sm" />
            {/* BR */}
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-accent rounded-br-sm" />
          </div>
        </div>
      </div>
      <p className="text-xs text-text-tertiary">Point camera at the QR code</p>
    </div>
  )
}
