import type { ActionResult } from 'deepspace/worker'
import { BOARD_RECORD_ID, MAX_NOTES, type BoardFields, type Note, type NoteFields } from '../schemas/board-schema'
import { MAX_EDGES, removeNoteEdges, validateEdge, type BoardEdge } from '../lib/board-edges'
import { MAX_SECTIONS, type BoardSection } from '../lib/board-sections'
import { readStudio, type StudioOp } from '../lib/board-studio'

export type RecordTool = <T>(tool: string, params: object, actor?: string) => Promise<ActionResult<T>>
type Receipt = { id: string; actor: string; expiresAt: number; note: Note; edges: BoardEdge[] }
type ReceiptIndex = Pick<Receipt, 'id' | 'expiresAt'>
const savedNoteKey = (id: string) => 'studio:deleted:' + id

type NoteWrite = { before?: Note; after?: Note; patch?: Partial<NoteFields> }
const receiptKey = 'studio:deleted-notes'
const STORAGE_BATCH_SIZE = 128

function* storageBatches<T>(items: T[]) {
  for (let index = 0; index < items.length; index += STORAGE_BATCH_SIZE) {
    yield items.slice(index, index + STORAGE_BATCH_SIZE)
  }
}

async function removeReceipts(storage: DurableObjectStorage, keys: string[]) {
  for (const batch of storageBatches(keys)) await storage.delete(batch)
}

const fail = (error: string, status = 409) => Response.json({ error }, { status })

class InvalidChange extends Error {
  constructor(message: string, readonly status = 409) { super(message) }
}
const reject = (message: string, status?: number): never => { throw new InvalidChange(message, status) }

function put<T extends { id: string }>(items: T[], item: T) {
  const index = items.findIndex(({ id }) => id === item.id)
  return index < 0 ? [...items, item] : items.map((old) => old.id === item.id ? item : old)
}

function edgeOp({ createdBy: _owner, ...edge }: BoardEdge): StudioOp {
  return { kind: 'edge.put', edge }
}

async function writeNote(run: RecordTool, change: NoteWrite, reverse = false) {
  const before = reverse ? change.after : change.before
  const after = reverse ? change.before : change.after
  const recordId = (after ?? before)!.recordId
  if (!after) return run('records.delete', { collection: 'notes', recordId })
  if (!before) return run('records.create', { collection: 'notes', recordId, data: after.data }, after.createdBy)
  return run('records.update', {
    collection: 'notes', recordId,
    data: reverse ? Object.fromEntries(Object.keys(change.patch ?? {}).map((key) => [key, beforeValue(after, key)])) : change.patch,
  })
}

function beforeValue(note: Note, key: string) {
  return note.data[key as keyof NoteFields]
}

// Plan against the room's current records before mutating. SDK record tools
// remain the only path for writes and their corresponding subscriptions.
export async function commitStudio(run: RecordTool, storage: DurableObjectStorage, userId: string, ops: StudioOp[]) {
  const board = await run<{ record: { data: BoardFields } }>('records.get', { collection: 'boards', recordId: BOARD_RECORD_ID })
  if (!board.success) return fail('Could not load the board.', 503)
  const query = await run<{ records: Note[] }>('records.query', { collection: 'notes', limit: MAX_NOTES })
  if (!query.success) return fail('Could not load the notes.', 503)
  const notes = new Map(query.data.records.map((note) => [note.recordId, note]))
  const liveIds = new Set(notes.keys())
  const original = readStudio(board.data.record.data)
  let { edges, sections } = original
  const now = Date.now()
  const index = await storage.get<ReceiptIndex[]>(receiptKey) ?? []
  let nextIndex = index.filter((entry) => entry.expiresAt > now)
  const restoreKeys = [...new Set(ops.flatMap((op) => op.kind === 'note.restore' ? [savedNoteKey(op.receipt)] : []))]
  const restored = new Map<string, Receipt>()
  for (const batch of storageBatches(restoreKeys)) {
    for (const [key, receipt] of await storage.get<Receipt>(batch)) restored.set(key, receipt)
  }
  const generated = new Map<string, Receipt>()
  const inverse: StudioOp[] = []
  const writes: NoteWrite[] = []

  function deleteNote(id: string) {
    const note = notes.get(id)
    if (!note) return
    const attached = edges.filter((edge) => edge.fromNoteId === id || edge.toNoteId === id)
    const receipt = { id: crypto.randomUUID(), actor: userId, expiresAt: now + 24 * 60 * 60 * 1000, note, edges: attached }
    generated.set(savedNoteKey(receipt.id), receipt)
    nextIndex.push({ id: receipt.id, expiresAt: receipt.expiresAt })
    writes.push({ before: note })
    inverse.unshift({ kind: 'note.restore', id, receipt: receipt.id })
    notes.delete(id)
    liveIds.delete(id)
    edges = removeNoteEdges(edges, new Set([id]))
  }

  function restoreNote(id: string, token: string) {
    const receipt = nextIndex.some(({ id }) => id === token) ? restored.get(savedNoteKey(token)) : undefined
    if (!receipt || receipt.actor !== userId || receipt.note.recordId !== id || notes.has(id) || notes.size >= MAX_NOTES) return reject('The deleted note can no longer be restored.')
    writes.push({ after: receipt.note })
    notes.set(id, receipt.note)
    liveIds.add(id)
    nextIndex = nextIndex.filter((item) => item.id !== token)
    // Attached edges may reference another note restored later in this batch.
    for (const edge of receipt.edges) if (!edges.some((item) => item.id === edge.id)) edges = [...edges, edge]
    inverse.unshift({ kind: 'note.delete', id })
  }

  function patchNote(op: Extract<StudioOp, { kind: 'note.patch' }>) {
    const note = notes.get(op.id)
    if (!note) return reject('A note in this change is no longer on the board.', 404)
    if (op.expect && Object.entries(op.expect).some(([key, value]) => beforeValue(note, key) !== value)) {
      return reject('A collaborator changed one of these notes. Your history was kept.')
    }
    const before = 'x' in op.set ? { x: note.data.x, y: note.data.y } : 'markdown' in op.set ? { markdown: note.data.markdown } : { color: note.data.color }
    if (Object.entries(op.set).every(([key, value]) => beforeValue(note, key) === value)) return
    const after = { ...note, data: { ...note.data, ...op.set } }
    writes.push({ before: note, after, patch: op.set })
    notes.set(op.id, after)
    inverse.unshift({ kind: 'note.patch', id: op.id, set: before, expect: op.set })
  }

  function putEdge(edge: Extract<StudioOp, { kind: 'edge.put' }>['edge']) {
    const previous = edges.find(({ id }) => id === edge.id)
    if (!validateEdge(edge, liveIds, edges)) return reject('Connect two existing notes without duplicating a thread.')
    edges = put(edges, { ...edge, createdBy: previous?.createdBy ?? userId })
    inverse.unshift(previous ? edgeOp(previous) : { kind: 'edge.delete', id: edge.id })
  }

  function putSection(section: BoardSection) {
    const previous = sections.find(({ id }) => id === section.id)
    sections = put(sections, section)
    inverse.unshift(previous ? { kind: 'section.put', section: previous } : { kind: 'section.delete', id: section.id })
  }

  try {
    for (const op of ops) switch (op.kind) {
      case 'note.patch': patchNote(op); break
      case 'note.delete': deleteNote(op.id); break
      case 'note.restore': restoreNote(op.id, op.receipt); break
      case 'edge.put': putEdge(op.edge); break
      case 'edge.delete': {
        const previous = edges.find(({ id }) => id === op.id)
        if (previous) inverse.unshift(edgeOp(previous))
        edges = edges.filter(({ id }) => id !== op.id)
        break
      }
      case 'section.put': putSection(op.section); break
      case 'section.delete': {
        const previous = sections.find(({ id }) => id === op.id)
        if (previous) inverse.unshift({ kind: 'section.put', section: previous })
        sections = sections.filter(({ id }) => id !== op.id)
        break
      }
    }
    const pairs = new Set<string>()
    edges = edges.filter((edge) => {
      const pair = edge.fromNoteId + ':' + edge.toNoteId
      if (!liveIds.has(edge.fromNoteId) || !liveIds.has(edge.toNoteId) || pairs.has(pair)) return false
      pairs.add(pair)
      return true
    })
    if (edges.length > MAX_EDGES || sections.length > MAX_SECTIONS) return fail('This board has reached its thread or section limit.')
  } catch (error) {
    if (error instanceof InvalidChange) return fail(error.message, error.status)
    throw error
  }

  const applied: NoteWrite[] = []
  const data: Partial<BoardFields> = {}
  if (JSON.stringify(edges) !== JSON.stringify(original.edges)) data.edges = JSON.stringify(edges)
  if (sections !== original.sections) data.sections = JSON.stringify(sections)
  try {
    for (const batch of storageBatches([...generated])) await storage.put(Object.fromEntries(batch))
    for (const change of writes) {
      if (!(await writeNote(run, change)).success) throw new Error('Note write failed')
      applied.push(change)
    }
    if (Object.keys(data).length) {
      const saved = await run('records.update', { collection: 'boards', recordId: BOARD_RECORD_ID, data })
      if (!saved.success) throw new Error('Board write failed')
    }
    if (generated.size || nextIndex.length !== index.length) {
      nextIndex = nextIndex.slice(-240)
      const kept = new Set(nextIndex.map(({ id }) => id))
      const obsolete = index.filter(({ id }) => !kept.has(id)).map(({ id }) => savedNoteKey(id))
      // Receipt data remains private to the room. Keep individual records
      // below storage value limits even for notes with many reactions.
      await storage.put(receiptKey, nextIndex).then(() => removeReceipts(storage, obsolete)).catch(() => {})
    }
    return Response.json({ inverse })
  } catch {
    for (const change of applied.reverse()) {
      await writeNote(run, change, true).catch(() => {})
    }
    await removeReceipts(storage, [...generated.keys()]).catch(() => {})
    return fail('The board change could not be saved. Refresh before retrying.', 503)
  }
}
