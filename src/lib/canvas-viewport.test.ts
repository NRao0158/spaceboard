import { describe, expect, it } from 'vitest'
import { CANVAS_HEIGHT, CANVAS_WIDTH, NOTE_WIDTH } from '../schemas/board-schema'
import { canvasToScreen, constrainCamera, fitToNotes, MAX_ZOOM, MIN_ZOOM, NOTE_HEIGHT, screenToCanvas, zoomAt } from './canvas-viewport'

describe('canvas camera', () => {
  it.each([MIN_ZOOM, 1, MAX_ZOOM])('round trips coordinates at zoom %s', (zoom) => {
    const camera = { x: -91.3, y: -205.4, zoom }
    const point = { x: 460, y: 780 }
    const result = screenToCanvas(canvasToScreen(point, camera), camera)
    expect(result.x).toBeCloseTo(point.x)
    expect(result.y).toBeCloseTo(point.y)
  })

  it('keeps the same canvas point under the wheel anchor even at the zoom limit', () => {
    const camera = { x: -100, y: -120, zoom: 1 }
    const pointer = { x: 50, y: 80 }
    const next = zoomAt(camera, 9, pointer)
    expect(next.zoom).toBe(MAX_ZOOM)
    expect(canvasToScreen(screenToCanvas(pointer, camera), next)).toEqual(pointer)
  })

  it('fits whole notes and reserves room for the dock when the bounds allow it', () => {
    const points = [{ x: 650, y: 550 }, { x: 1030, y: 800 }]
    const size = { width: 650, height: 510 }
    const view = fitToNotes(points, size)
    const start = canvasToScreen(points[0], view)
    const end = canvasToScreen({ x: points[1].x + NOTE_WIDTH, y: points[1].y + NOTE_HEIGHT }, view)
    expect(start.x).toBeGreaterThanOrEqual(35)
    expect(start.y).toBeGreaterThanOrEqual(55)
    expect(end.x).toBeLessThan(size.width - 35)
    expect(end.y).toBeLessThan(size.height - 55)
  })

  it('centers empty axes and keeps both board edges reachable at minimum zoom', () => {
    const size = { width: 1500, height: 300 }
    const view = constrainCamera({ x: -10000, y: -10000, zoom: MIN_ZOOM }, size)
    expect(view.x).toBe((size.width - CANVAS_WIDTH * MIN_ZOOM) / 2)
    expect(view.y).toBe(size.height - CANVAS_HEIGHT * MIN_ZOOM)
    expect(fitToNotes([], size).zoom).toBe(1)
  })
})
