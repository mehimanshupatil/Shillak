/**
 * Camera QR scanner — getUserMedia + jsQR.
 * Full control over video element; no library injecting DOM or fighting CSS.
 * Calls onScan(result) once per unique decoded value (2 s debounce).
 * Calls onError if camera permission denied or getUserMedia unavailable.
 *
 * Also renders a "Paste code" fallback input for when the in-app camera
 * can't scan but the device's native camera app can.
 */
import jsQR from 'jsqr'
import { ClipboardPaste, X } from 'lucide-react'
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
  const [showPaste, setShowPaste] = useState(false)
  const [pasteValue, setPasteValue] = useState('')

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
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
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

  function handlePasteSubmit() {
    const val = pasteValue.trim()
    if (!val) return
    onScan(val)
    setPasteValue('')
    setShowPaste(false)
  }

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
        <div className="absolute inset-x-0 top-0 h-[calc(50%-104px)] bg-black/60" />
        <div className="absolute inset-x-0 bottom-0 h-[calc(50%-104px)] bg-black/60" />
        <div className="absolute left-0 top-[calc(50%-104px)] h-52 w-[calc(50%-104px)] bg-black/60" />
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

      {/* Bottom controls */}
      <div className="absolute bottom-0 inset-x-0 flex flex-col items-center gap-3 pb-10 px-6">
        {!showPaste ? (
          <>
            <p className="text-sm text-white/70">Point camera at the QR code</p>
            <button
              type="button"
              onClick={() => setShowPaste(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-white/80 text-xs"
            >
              <ClipboardPaste size={14} />
              Paste code manually
            </button>
          </>
        ) : (
          <div className="w-full flex flex-col gap-2">
            <p className="text-xs text-white/60 text-center">
              Scan QR with your camera app, copy the text, paste here
            </p>
            <div className="flex gap-2">
              <textarea
                // biome-ignore lint/a11y/noAutofocus: intentional — user tapped to open this input
                autoFocus
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                onPaste={(e) => {
                  // Auto-submit on paste
                  const text = e.clipboardData.getData('text').trim()
                  if (text) {
                    e.preventDefault()
                    onScan(text)
                    setPasteValue('')
                    setShowPaste(false)
                  }
                }}
                placeholder="Paste code here…"
                rows={3}
                className="flex-1 rounded-xl bg-white/10 text-white placeholder-white/30 text-xs px-3 py-2 resize-none outline-none border border-white/20 focus:border-accent"
              />
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  disabled={!pasteValue.trim()}
                  className="px-3 py-2 rounded-xl bg-accent text-black text-xs font-semibold disabled:opacity-40"
                >
                  Submit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPaste(false)
                    setPasteValue('')
                  }}
                  className="px-3 py-2 rounded-xl bg-white/10 text-white/70 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
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
