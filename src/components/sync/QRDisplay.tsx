/**
 * Full-screen QR code display for easy scanning by another device.
 * White background, maximum size, optional action button and chunk navigation.
 */
import { CaretLeftIcon, CaretRightIcon, XIcon } from '@phosphor-icons/react'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

interface Props {
  value: string
  label?: string
  onClose?: () => void
  /** Primary action button shown at the bottom (e.g. "Next step →") */
  action?: { label: string; onClick: () => void }
  /** Chunk navigation for QR batch export */
  chunkNav?: {
    index: number
    total: number
    onPrev: () => void
    onNext: () => void
  }
}

export default function QRDisplay({ value, label, onClose, action, chunkNav }: Props) {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    setDataUrl('')
    setError('')
    const size = Math.min(window.innerWidth, window.innerHeight) - 80
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then(setDataUrl)
      .catch((e: unknown) => setError(String(e)))
  }, [value])

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-0">
      {/* Close */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-12 right-4 w-10 h-10 rounded-full bg-black/10 flex items-center justify-center"
        >
          <XIcon size={20} className="text-black" />
        </button>
      )}

      {/* Label */}
      {label && (
        <p className="absolute top-12 left-4 right-16 text-sm text-black/60 leading-snug">
          {label}
        </p>
      )}

      {/* QR image */}
      {error && <p className="text-sm text-red-500 px-8 text-center">QR error: {error}</p>}
      {!dataUrl && !error && (
        <div className="w-12 h-12 rounded-full border-2 border-black/20 border-t-black/60 animate-spin" />
      )}
      {dataUrl && (
        <img
          src={dataUrl}
          alt="QR code"
          className="w-full max-w-[min(calc(100vw-32px),calc(100svh-200px))] aspect-square"
        />
      )}

      {/* Chunk navigation */}
      {chunkNav && (
        <div className="absolute bottom-20 flex items-center gap-6">
          <button
            type="button"
            onClick={chunkNav.onPrev}
            disabled={chunkNav.index === 0}
            className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center disabled:opacity-30"
          >
            <CaretLeftIcon size={22} className="text-black" />
          </button>
          <span className="text-base font-semibold text-black">
            {chunkNav.index + 1} / {chunkNav.total}
          </span>
          <button
            type="button"
            onClick={chunkNav.onNext}
            disabled={chunkNav.index === chunkNav.total - 1}
            className="w-12 h-12 rounded-full bg-black/10 flex items-center justify-center disabled:opacity-30"
          >
            <CaretRightIcon size={22} className="text-black" />
          </button>
        </div>
      )}

      {/* Action button */}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="absolute bottom-8 left-6 right-6 h-13 rounded-2xl bg-black text-white text-sm font-semibold py-4"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
