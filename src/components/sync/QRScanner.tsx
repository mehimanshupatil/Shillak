/**
 * Camera QR scanner — getUserMedia + jsQR.
 * Full control over video element; no library injecting DOM or fighting CSS.
 * Calls onScan(result) once per unique decoded value (2 s debounce).
 * Calls onError if camera permission denied or getUserMedia unavailable.
 */
import jsQR from 'jsqr'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  onScan: (result: string) => void
  onError?: (err: string) => void
  onClose?: () => void
  active?: boolean
}

export default function QRScanner({ onScan, onError, onClose, active = true }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const lastScanRef = useRef<string>('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!active) return

    let stream: MediaStream | null = null
    let stopped = false

    function tick() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || stopped) return

      if (video.readyState >= 2 && video.videoWidth > 0) {
        const w = video.videoWidth
        const h = video.videoHeight
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h)
          const imageData = ctx.getImageData(0, 0, w, h)
          const result = jsQR(imageData.data, w, h, { inversionAttempts: 'dontInvert' })
          if (result?.data && result.data !== lastScanRef.current) {
            lastScanRef.current = result.data
            onScan(result.data)
            setTimeout(() => {
              lastScanRef.current = ''
            }, 2000)
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    async function start() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        })
        if (stopped) {
          for (const t of stream.getTracks()) t.stop()
          return
        }
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream
        await video.play()
        setReady(true)
        rafRef.current = requestAnimationFrame(tick)
      } catch (err) {
        onError?.(String(err))
      }
    }

    start()

    return () => {
      stopped = true
      cancelAnimationFrame(rafRef.current)
      if (stream) for (const t of stream.getTracks()) t.stop()
      setReady(false)
    }
  }, [active, onScan, onError])

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Full-screen camera feed */}
      <video
        ref={videoRef}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />
      <canvas ref={canvasRef} className="hidden" />

      {/* Dim overlay outside scan zone */}
      <div className="absolute inset-0 pointer-events-none">
        {/* top */}
        <div className="absolute inset-x-0 top-0 h-[calc(50%-104px)] bg-black/60" />
        {/* bottom */}
        <div className="absolute inset-x-0 bottom-0 h-[calc(50%-104px)] bg-black/60" />
        {/* left */}
        <div className="absolute left-0 top-[calc(50%-104px)] h-52 w-[calc(50%-104px)] bg-black/60" />
        {/* right */}
        <div className="absolute right-0 top-[calc(50%-104px)] h-52 w-[calc(50%-104px)] bg-black/60" />
      </div>

      {/* Loading spinner */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
        </div>
      )}

      {/* Scan zone — corner brackets */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-52 h-52">
          <span className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-accent rounded-tl" />
          <span className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-accent rounded-tr" />
          <span className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-accent rounded-bl" />
          <span className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-accent rounded-br" />
        </div>
      </div>

      {/* Label */}
      <div className="absolute bottom-20 inset-x-0 flex flex-col items-center gap-2">
        <p className="text-sm text-white/80">Point camera at the QR code</p>
      </div>

      {/* Close button */}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-12 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center text-white"
        >
          <X size={20} />
        </button>
      )}
    </div>
  )
}
