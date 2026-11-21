import { expect, it } from 'vitest'
import { MAX_NOTES, notePositionSchema } from '../schemas/board-schema'
import { clusterByTheme, findFreeNoteSpot, parseBoardInsights } from './theme-layout'

const a = 'c6780fef-c0eb-4d11-83ab-a3fa0cbb8101'
const b = 'c6780fef-c0eb-4d11-83ab-a3fa0cbb8102'
const foreign = 'c6780fef-c0eb-4d11-83ab-a3fa0cbb8103'

it('removes duplicate, foreign, and invalid IDs and omits unlinked themes', () => {
  const content = JSON.stringify({
    summary: 'Pilot', nextSteps: ['Start Monday'],
    themes: [
      { name: 'Pilot', detail: 'Start with one team.', noteIds: [b, b, 'bad', foreign, a] },
      { name: 'Unlinked', detail: 'No source.', noteIds: [foreign] },
    ],
  })
  expect(parseBoardInsights(content, [a, b])).toEqual({
    summary: 'Pilot', nextSteps: ['Start Monday'], themes: [{ name: 'Pilot', detail: 'Start with one team.', noteIds: [b, a] }],
  })
  expect(() => parseBoardInsights('{"summary":42}', [a])).toThrow()
})

it('puts each note into one column group and leaves a separate group for unmatched notes', () => {
  const layout = clusterByTheme(['a', 'b', 'c', 'd'], [{ noteIds: ['a', 'b'] }, { noteIds: ['b', 'c'] }])
  expect(layout.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd'])
  expect(layout[0].x).toBe(layout[1].x)
  expect(layout[2].x).toBeGreaterThan(layout[1].x)
  expect(layout[3].x).toBeGreaterThan(layout[2].x)
})

it('fits the maximum board size with no duplicate or out-of-bounds placements', () => {
  const ids = Array.from({ length: MAX_NOTES }, (_, index) => 'note-' + index)
  const layout = clusterByTheme(ids, ids.slice(0, 7).map((id) => ({ noteIds: [id] })))
  expect(layout).toHaveLength(MAX_NOTES)
  expect(new Set(layout.map(({ x, y }) => x + ',' + y)).size).toBe(MAX_NOTES)
  expect(layout.every(({ x, y }) => notePositionSchema.safeParse({ x, y }).success)).toBe(true)
  expect(findFreeNoteSpot(layout, { x: 12, y: 24 })).toBeNull()
})
