import { RECORD_NOT_FOUND, RecordRoom, type ActionResult } from 'deepspace/worker'
import type { RecordData } from 'deepspace'
import type { Env } from '../../worker.js'
import { BOARD_RECORD_ID, MAX_NOTES, boardRoomId, boardSchemas, type BoardFields } from '../schemas/board-schema.js'
import { readReactions, setReaction, type ReactionKind } from '../lib/board-reactions.js'
import { usersSchema } from '../schemas/users-schema.js'

type Collection = 'boards' | 'notes'
type RecordResult<T> = { record: RecordData<T> }
type ReactionChange = { noteId: string; kind: ReactionKind; active: boolean }
type CreateRecord = { collection: Collection; recordId: string; data: Record<string, unknown> }
const TOOL_PATH = '/api/tools/execute'
const CREATE_PATH = '/internal/spaceboard/create'

const REACTION_PATH = '/internal/spaceboard/reaction'

function internalRequest(path: string, userId: string, body: object) {
  return new Request('https://spaceboard.internal' + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      'X-App-Action': 'true',
    },
    body: JSON.stringify(body),
  })
}

export class BoardRecordRoom extends RecordRoom<Env> {
  private writes = Promise.resolve()

  constructor(state: DurableObjectState, env: Env) {
    const roster = {
      ...usersSchema,
      permissions: {
        viewer: { read: 'own', create: false, update: false, delete: false },
        member: { read: 'own', create: false, update: false, delete: false },
      },
    } satisfies typeof usersSchema
    super(state, env, [roster, ...boardSchemas])
  }

  override fetch(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    if (path !== CREATE_PATH && path !== REACTION_PATH) return super.fetch(request)
    const userId = request.headers.get('X-User-Id')
    if (request.method !== 'POST' || !userId || request.headers.get('X-App-Action') !== 'true') {
      return Promise.resolve(new Response(null, { status: 403 }))
    }
    // Serialize read-modify-write operations in this board room, including
    // retry-safe creates and concurrent votes for the same note.
    const write = this.writes.then(async () => {
      if (path === REACTION_PATH) return this.updateReaction(userId, await request.json<ReactionChange>())
      const input = await request.json<CreateRecord>()
      return this.createOnce(userId, input)
    })
    this.writes = write.then(() => undefined, () => undefined)
    return write
  }

  private async updateReaction(userId: string, { noteId, kind, active }: ReactionChange) {
    const target = { collection: 'notes', recordId: noteId }
    const found = await super.fetch(internalRequest(TOOL_PATH, userId, { tool: 'records.get', params: target }))
    const result = await found.json<ActionResult<RecordResult<{ reactions?: string }>>>()
    if (!result.success) return Response.json({ error: 'Could not load the note.' }, {
      status: result.error === RECORD_NOT_FOUND ? 404 : 503,
    })
    const current = readReactions(result.data.record.data.reactions)
    const reactions = setReaction(current, userId, kind, active)
    if (!reactions) return Response.json({ error: 'This note has reached its reaction limit.' }, { status: 409 })
    if (reactions === current) return Response.json({ reactions })
    const saved = await super.fetch(internalRequest(TOOL_PATH, userId, {
      tool: 'records.update', params: { ...target, data: { reactions: JSON.stringify(reactions) } },
    }))
    const update = await saved.json<ActionResult<unknown>>()
    if (!update.success) return Response.json({ error: 'Could not save the reaction.' }, {
      status: update.error === RECORD_NOT_FOUND ? 404 : 503,
    })
    return Response.json({ reactions })
  }

  private async createOnce(userId: string, input: CreateRecord) {
    const { collection, recordId } = input
    const lookup = await super.fetch(internalRequest(TOOL_PATH, userId, {
      tool: 'records.get', params: { collection, recordId },
    }))
    const existing = await lookup.json<ActionResult<RecordResult<Record<string, unknown>>>>()
    if (existing.success) {
      const { record } = existing.data
      if (record.createdBy !== userId) return Response.json({ error: 'Record ID is already in use.' }, { status: 409 })
      return Response.json({ data: record.data })
    }
    if (existing.error !== RECORD_NOT_FOUND) {
      return Response.json({ error: 'Could not check for an existing record.' }, { status: 503 })
    }

    if (collection === 'notes') {
      const listed = await super.fetch(internalRequest(TOOL_PATH, userId, {
        tool: 'records.query', params: { collection, limit: MAX_NOTES },
      }))
      const notes = await listed.json<ActionResult<{ count: number }>>()
      if (!notes.success) return Response.json({ error: 'Could not check the note count.' }, { status: 503 })
      if (notes.data.count >= MAX_NOTES) {
        return Response.json({ error: 'This board is full. Delete a note before adding another.' }, { status: 409 })
      }
    }

    const saved = await super.fetch(internalRequest(TOOL_PATH, userId, {
      tool: 'records.create', params: input,
    }))
    const result = await saved.json<ActionResult<{ recordId: string }>>()
    if (!result.success) return Response.json({ error: 'Could not create the record. Try again.' }, { status: 503 })
    return Response.json({ data: input.data }, { status: 201 })
  }
}

export function boardStub(env: Env, boardId: string) {
  const namespace = env.BOARD_ROOMS
  return namespace.get(namespace.idFromName(boardRoomId(boardId)))
}

export async function boardTool<T>(
  stub: DurableObjectStub,
  userId: string,
  tool: 'records.get' | 'records.query' | 'records.update' | 'records.delete',
  params: object,
) {
  const response = await stub.fetch(internalRequest(TOOL_PATH, userId, { tool, params }))
  return response.json<ActionResult<T>>()
}

export function createBoardRecord(stub: DurableObjectStub, userId: string, input: CreateRecord) {
  return stub.fetch(internalRequest(CREATE_PATH, userId, input))
}

export function writeBoardReaction(stub: DurableObjectStub, userId: string, input: ReactionChange) {
  return stub.fetch(internalRequest(REACTION_PATH, userId, input))
}

export async function getBoard(stub: DurableObjectStub, userId: string) {
  const result = await boardTool<RecordResult<BoardFields>>(stub, userId, 'records.get', {
    collection: 'boards', recordId: BOARD_RECORD_ID,
  })
  if (result.success) return result.data.record
  if (result.error === RECORD_NOT_FOUND) return null
  throw new Error('Board lookup failed')
}
