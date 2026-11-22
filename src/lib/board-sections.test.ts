import { expect, it } from 'vitest'
import { boundingNotes, insideSection, sectionSchema, wrapSection } from './board-sections'
import { NOTE_WIDTH } from '../schemas/board-schema'
import { NOTE_HEIGHT } from './canvas-viewport'

it('uses the note center even when the note overlaps a section boundary', () => {
  const frame = { x: 200, y: 200, width: 500, height: 400 }
  expect(insideSection(frame, { x: 200 - NOTE_WIDTH / 2, y: 200 - NOTE_HEIGHT / 2 })).toBe(true)
  expect(insideSection(frame, { x: 199 - NOTE_WIDTH / 2, y: 200 - NOTE_HEIGHT / 2 })).toBe(false)
  expect(insideSection(frame, { x: 450, y: 330 })).toBe(true)
  expect(insideSection(frame, { x: 650, y: 540 })).toBe(false)
})

it('wraps notes at the edges without growing outside the board', () => {
  const points = [{ x: 0, y: 0 }, { x: 2952, y: 2100 }]
  const section = wrapSection(boundingNotes(points)!, 'Full board', 'rose')
  expect(sectionSchema.safeParse(section).success).toBe(true)
  expect(points.every((point) => insideSection(section, point))).toBe(true)
})
