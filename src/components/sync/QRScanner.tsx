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
          { fps: 10, qrbox: { width: 240, height: 240 } },
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
    <div className="flex flex-col items-center gap-3">
      <div
        id={scannerId}
        className="rounded-xl overflow-hidden bg-black"
        style={{ width: 280, height: 280 }}
      />
      <p className="text-xs text-text-tertiary">Point camera at the QR code</p>
    </div>
  )
}
