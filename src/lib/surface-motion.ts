import { useEffect, useRef, type PointerEvent } from 'react'

const pointerMedia = '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)'

export function useSurfaceMotion<T extends HTMLElement>() {
  const frame = useRef(0)
  const target = useRef<T | null>(null)
  const point = useRef({ x: 0, y: 0 })

  function reset() {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
    const surface = target.current
    if (!surface) return
    delete surface.dataset.sbPointer
    for (const property of ['--sb-rotate-x', '--sb-rotate-y', '--sb-pull-x', '--sb-pull-y']) {
      surface.style.removeProperty(property)
    }
    target.current = null
  }

  function track(event: PointerEvent<T>) {
    if (event.pointerType !== 'mouse' || !window.matchMedia(pointerMedia).matches) return
    target.current = event.currentTarget
    point.current = { x: event.clientX, y: event.clientY }
    if (frame.current) return

    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const surface = target.current
      if (!surface?.isConnected) return
      // Read the stationary hit area before updating its transformed children.
      const rect = surface.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = Math.max(0, Math.min(rect.width, point.current.x - rect.left))
      const y = Math.max(0, Math.min(rect.height, point.current.y - rect.top))
      const dx = x / rect.width - 0.5
      const dy = y / rect.height - 0.5
      surface.style.setProperty('--sb-pointer-x', x + 'px')
      surface.style.setProperty('--sb-pointer-y', y + 'px')
      surface.style.setProperty('--sb-rotate-x', (-dy * 8).toFixed(2) + 'deg')
      surface.style.setProperty('--sb-rotate-y', (dx * 8).toFixed(2) + 'deg')
      surface.style.setProperty('--sb-pull-x', (dx * 12).toFixed(2) + 'px')
      surface.style.setProperty('--sb-pull-y', (dy * 8).toFixed(2) + 'px')
      surface.dataset.sbPointer = 'active'
    })
  }

  useEffect(() => {
    const media = window.matchMedia(pointerMedia)
    media.addEventListener('change', reset)
    return () => {
      media.removeEventListener('change', reset)
      reset()
    }
  }, [])

  return { onPointerMove: track, onPointerLeave: reset, onPointerCancel: reset }
}

export function useScrollReveal() {
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!root.current || !('IntersectionObserver' in window)) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    const observer = new IntersectionObserver((entries) => {
      for (const { target, isIntersecting } of entries) {
        if (!isIntersecting) continue
        if (!motion.matches) target.setAttribute('data-sb-entered', '')
        observer.unobserve(target)
      }
    }, { threshold: 0.16 })
    root.current.querySelectorAll('[data-sb-reveal]').forEach((item) => observer.observe(item))
    return () => observer.disconnect()
  }, [])

  return root
}
