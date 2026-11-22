import { expect, it } from 'vitest'
import { constrainGroupDelta, intersectingNotes, marqueeRect, snapAlignment } from './canvas-guides'
import { NOTE_WIDTH } from '../schemas/board-schema'

it('snaps to the nearest line per axis within the pixel tolerance', () => {
  const result = snapAlignment({ x: 100 + NOTE_WIDTH - 5, y: 606 }, [{ x: 100, y: 600 }, { x: 350, y: 720 }])
  expect(result.point).toEqual({ x: 348, y: 600 })
  expect(result.guides).toEqual({ x: 348, y: 600 })
  expect(snapAlignment({ x: 112, y: 620 }, [{ x: 100, y: 600 }]).guides).toEqual({ x: undefined, y: undefined })
})

it('handles reversed marquee directions and moves a group without compressing its spacing', () => {
  const notes = [{ id: 'a', x: 100, y: 200 }, { id: 'b', x: 420, y: 500 }, { id: 'c', x: 950, y: 40 }]
  expect(intersectingNotes(marqueeRect({ x: 440, y: 520 }, { x: 160, y: 240 }), notes)).toEqual(['a', 'b'])
  expect(constrainGroupDelta(notes.slice(0, 2), { x: -200, y: 50 })).toEqual({ x: -100, y: 50 })
})
