import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type { Point } from '../schemas/board-schema'
import { centerCamera, constrainCamera, fitToNotes, screenToCanvas, zoomAt, type Camera, type Size } from './canvas-viewport'

const initial: Camera = { x: 0, y: 0, zoom: 1 }

export function useCanvasViewport(onManual?: () => void) {
  const viewport = useRef<HTMLDivElement>(null)
  const cameraRef = useRef(initial)
  const sizeRef = useRef<Size>({ width: 1, height: 1 })
  const frame = useRef(0)
  const followFrame = useRef(0)
  const followTarget = useRef<Point | null>(null)
  const manual = useRef(onManual)
  manual.current = onManual
  const drag = useRef<{ id: number; start: Point; origin: Camera } | null>(null)
  const [camera, setCamera] = useState(initial)
  const [size, setSize] = useState(sizeRef.current)
  const [panning, setPanning] = useState(false)

  const apply = useCallback((next: Camera) => {
    cameraRef.current = constrainCamera(next, sizeRef.current)
    setCamera(cameraRef.current)
  }, [])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      sizeRef.current = { width, height }
      setSize(sizeRef.current)
      apply(cameraRef.current)
    })
    observer.observe(element)
    function wheel(event: WheelEvent) {
      if (!element) return
      const target = event.target
      if (!event.ctrlKey && !event.metaKey && target instanceof Element) {
        const scroll = target.closest('[data-note-scroll]')
        if (scroll && scroll.scrollHeight > scroll.clientHeight) return
      }
      event.preventDefault()
      manual.current?.()
      cancelAnimationFrame(frame.current)
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1
      const current = cameraRef.current
      if (event.ctrlKey || event.metaKey) {
        const bounds = element.getBoundingClientRect()
        apply(zoomAt(current, current.zoom * Math.exp(-event.deltaY * multiplier * .002), {
          x: event.clientX - bounds.left, y: event.clientY - bounds.top,
        }))
      } else {
        const x = event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX
        const y = event.shiftKey && !event.deltaX ? 0 : event.deltaY
        apply({ ...current, x: current.x - x * multiplier, y: current.y - y * multiplier })
      }
    }
    element.addEventListener('wheel', wheel, { passive: false })
    return () => {
      cancelAnimationFrame(followFrame.current)
      observer.disconnect()
      element.removeEventListener('wheel', wheel)
      cancelAnimationFrame(frame.current)
    }
  }, [apply])

  function animate(next: Camera) {
    cancelAnimationFrame(frame.current)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      apply(next)
      return
    }
    const start = cameraRef.current
    const started = performance.now()
    function tick(now: number) {
      const progress = Math.min(1, (now - started) / 240)
      const eased = 1 - (1 - progress) ** 3
      apply({
        x: start.x + (next.x - start.x) * eased,
        y: start.y + (next.y - start.y) * eased,
        zoom: start.zoom + (next.zoom - start.zoom) * eased,
      })
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  function pointAt(clientX: number, clientY: number) {
    const bounds = viewport.current?.getBoundingClientRect()
    return screenToCanvas({ x: clientX - (bounds?.left ?? 0), y: clientY - (bounds?.top ?? 0) }, cameraRef.current)
  }

  function follow(point: Point | null) {
    followTarget.current = point
    if (!point) {
      cancelAnimationFrame(followFrame.current)
      followFrame.current = 0
      return
    }
    if (followFrame.current) return
    cancelAnimationFrame(frame.current)
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    function chase() {
      followFrame.current = 0
      if (!followTarget.current) return
      const current = cameraRef.current
      const next = centerCamera(followTarget.current, sizeRef.current, current.zoom)
      const dx = next.x - current.x
      const dy = next.y - current.y
      if (reduce || Math.hypot(dx, dy) < .7) { apply(next); return }
      apply({ ...current, x: current.x + dx * .19, y: current.y + dy * .19 })
      followFrame.current = requestAnimationFrame(chase)
    }
    followFrame.current = requestAnimationFrame(chase)
  }

  function focus(point: Point, smooth = true) {
    const next = centerCamera(point, sizeRef.current, cameraRef.current.zoom)
    if (smooth) animate(next)
    else {
      cancelAnimationFrame(frame.current)
      apply(next)
    }
  }

  function startPan(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) return
    cancelAnimationFrame(frame.current)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: cameraRef.current }
    setPanning(true)
  }

  function movePan(event: PointerEvent<HTMLDivElement>) {
    const active = drag.current
    if (!active || active.id !== event.pointerId) return
    apply({
      ...active.origin, x: active.origin.x + event.clientX - active.start.x,
      y: active.origin.y + event.clientY - active.start.y,
    })
  }

  function stopPan(event: PointerEvent<HTMLDivElement>) {
    if (drag.current?.id !== event.pointerId) return
    drag.current = null
    setPanning(false)
  }

  return {
    viewport, camera, size, panning, pointAt, focus, follow, startPan, movePan, stopPan,
    zoom: (value: number) => animate(constrainCamera(zoomAt(cameraRef.current, value, {
      x: sizeRef.current.width / 2, y: sizeRef.current.height / 2,
    }), sizeRef.current)),
    fit: (points: Point[]) => animate(fitToNotes(points, sizeRef.current)),
    center: () => screenToCanvas({ x: sizeRef.current.width / 2, y: sizeRef.current.height / 2 }, cameraRef.current),
  }
}
