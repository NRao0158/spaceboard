import { CANVAS_WIDTH, CANVAS_HEIGHT, NOTE_WIDTH, type Point } from '../schemas/board-schema'

export const MIN_ZOOM = .4
export const MAX_ZOOM = 1.6
export const NOTE_HEIGHT = 208
export type Size = { width: number; height: number }
export type Camera = Point & { zoom: number }

export function screenToCanvas(point: Point, camera: Camera): Point {
  return { x: (point.x - camera.x) / camera.zoom, y: (point.y - camera.y) / camera.zoom }
}

export function canvasToScreen(point: Point, camera: Camera): Point {
  return { x: point.x * camera.zoom + camera.x, y: point.y * camera.zoom + camera.y }
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
export const clampZoom = (zoom: number) => clamp(zoom, MIN_ZOOM, MAX_ZOOM)

export function constrainCamera(camera: Camera, size: Size): Camera {
  // Keep both edges reachable. Center the board when it fits on an axis.
  const axis = (offset: number, viewport: number, board: number) => {
    const remainder = viewport - board * camera.zoom
    return remainder >= 0 ? remainder / 2 : clamp(offset, remainder, 0)
  }
  return { ...camera, x: axis(camera.x, size.width, CANVAS_WIDTH), y: axis(camera.y, size.height, CANVAS_HEIGHT) }
}

export function zoomAt(camera: Camera, requested: number, anchor: Point): Camera {
  const zoom = clampZoom(requested)
  const world = screenToCanvas(anchor, camera)
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom }
}

export function centerCamera(point: Point, size: Size, zoom: number): Camera {
  return constrainCamera({ zoom, x: size.width / 2 - point.x * zoom, y: size.height / 2 - point.y * zoom }, size)
}

export function fitToNotes(points: Point[], size: Size): Camera {
  if (!points.length) return constrainCamera({ x: 0, y: 0, zoom: 1 }, size)
  const left = Math.min(...points.map((point) => point.x))
  const top = Math.min(...points.map((point) => point.y))
  const right = Math.max(...points.map((point) => point.x)) + NOTE_WIDTH
  const bottom = Math.max(...points.map((point) => point.y)) + NOTE_HEIGHT
  const zoom = clampZoom(Math.min((size.width - 72) / (right - left), (size.height - 118) / (bottom - top), 1))
  return centerCamera({ x: (left + right) / 2, y: (top + bottom) / 2 }, size, zoom)
}
