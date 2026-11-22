import { expect, it } from 'vitest'
import { layoutWithSections, parseBoardGaps } from './board-insights'
import { insideSection } from './board-sections'

const note = 'c6780fef-c0eb-4d11-83ab-a3fa0cbb8101'
const other = 'c6780fef-c0eb-4d11-83ab-a3fa0cbb8102'

it('strips repeated, foreign and malformed references and drops ungrounded gaps', () => {
  const model = { gaps: [
    { title: 'Timing', detail: 'The board lacks a freeze date.', prompt: 'When will timing be decided?', noteIds: [note, note, other, 'fake'] },
    { title: 'Other', detail: 'Unlinked.', prompt: 'How?', noteIds: [other] },
  ] }
  expect(parseBoardGaps(JSON.stringify(model), [note]).gaps).toEqual([{ ...model.gaps[0], noteIds: [note] }])
  expect(() => parseBoardGaps(JSON.stringify({ gaps: Array(5).fill(model.gaps[0]) }), [note])).toThrow()
})

it('creates named, color-coded frames whose members match their theme', () => {
  const { placements, sections } = layoutWithSections([note, other], [
    { name: 'Pilot', detail: 'One team.', noteIds: [note] }, { name: 'Safety', detail: 'Review early.', noteIds: [other] },
  ])
  expect(sections.map(({ title, color }) => [title, color])).toEqual([['Pilot', 'indigo'], ['Safety', 'emerald']])
  expect(placements.filter((point) => insideSection(sections[0], point)).map(({ id }) => id)).toEqual([note])
})
