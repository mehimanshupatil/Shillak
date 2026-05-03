/**
 * Renders a QR code from a string value.
 * Uses the `qrcode` npm package to generate a data URL, displayed in an <img>.
 */
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

interface Props {
  value: string
  size?: number
  label?: string
}

export default function QRDisplay({ value, size = 220, label }: Props) {
  const [dataUrl, setDataUrl] = useState<string>('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!value) return
    QRCode.toDataURL(value, {
      width: size,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    })
      .then(setDataUrl)
      .catch((e: unknown) => setError(String(e)))
  }, [value, size])

  if (error) {
    return (
      <div
        className="flex items-center justify-center rounded-xl bg-surface-2 text-xs text-danger"
        style={{ width: size, height: size }}
      >
        QR error
      </div>
    )
  }

  if (!dataUrl) {
    return (
      <div
        className="rounded-xl bg-surface-2 animate-pulse"
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl bg-white p-3">
        <img src={dataUrl} alt="QR code" width={size} height={size} />
      </div>
      {label && <p className="text-xs text-text-tertiary text-center max-w-50">{label}</p>}
    </div>
  )
}
