/**
 * Camera QR scanner using html5-qrcode.
 * Calls onScan(result) once per unique decoded value.
 * Calls onError if camera permission denied.
 */
import { Html5Qrcode } from 'html5-qrcode'
import { useEffect, useRef } from 'react'

interface Props {
  onScan: (result: string) => void
  onError?: (err: string) => void
  active?: boolean
}

const SCANNER_ID = 'shillak-qr-scanner'

export default function QRScanner({ onScan, onError, active = true }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScanRef = useRef<string>('')

  useEffect(() => {
    if (!active) return

    const scanner = new Html5Qrcode(SCANNER_ID)
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (text) => {
          // Debounce: ignore repeated identical scans
          if (text === lastScanRef.current) return
          lastScanRef.current = text
          onScan(text)
          // Reset after 2s so user can scan the next chunk
          setTimeout(() => {
            lastScanRef.current = ''
          }, 2000)
        },
        () => {
          // per-frame errors are noise — ignore
        },
      )
      .catch((err: unknown) => {
        onError?.(String(err))
      })

    return () => {
      scanner.stop().catch(() => {})
      scannerRef.current = null
    }
  }, [active, onScan, onError])

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        id={SCANNER_ID}
        className="rounded-xl overflow-hidden"
        style={{ width: 280, height: 280 }}
      />
      <p className="text-xs text-[var(--color-text-tertiary)]">Point camera at the QR code</p>
    </div>
  )
}
