/**
 * Sets --keyboard-h on :root = visible keyboard height in px.
 * iOS Safari/PWA: layout viewport doesn't shrink when keyboard opens,
 * so we use visualViewport to detect the gap and lift bottom sheets.
 * Android/Chrome: handled by interactive-widget=resizes-content in index.html.
 */
import { useEffect } from 'react'

export function useKeyboardHeight() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function update() {
      const h = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop)
      document.documentElement.style.setProperty('--keyboard-h', `${h}px`)
    }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    update()

    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.documentElement.style.removeProperty('--keyboard-h')
    }
  }, [])
}
