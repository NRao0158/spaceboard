import { RECORD_NOT_FOUND, RecordRoom, type ActionResult } from 'deepspace/worker'
import type { RecordData } from 'deepspace'
import type { Env } from '../../worker.js'
import { BOARD_RECORD_ID, MAX_NOTES, boardRoomId, boardSchemas, type BoardFields } from '../schemas/board-schema.js'
import { usersSchema } from '../schemas/users-schema.js'

type Collection = 'boards' | 'notes'
type RecordResult<T> = { record: RecordData<T> }
type CreateRecord = { collection: Collection; recordId: string; data: Record<string, unknown> }
const TOOL_PATH = '/api/tools/execute'
const CREATE_PATH = '/internal/spaceboard/create'

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
  private creations = Promise.resolve()

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
    if (new URL(request.url).pathname !== CREATE_PATH) return super.fetch(request)
    const userId = request.headers.get('X-User-Id')
    if (request.method !== 'POST' || !userId || request.headers.get('X-App-Action') !== 'true') {
      return Promise.resolve(new Response(null, { status: 403 }))
    }
    // Serialize the existence check and insert so retrying a create cannot
    // overwrite a record that was already created and edited.
    const create = this.creations.then(async () => {
      const input = await request.json<CreateRecord>()
      return this.createOnce(userId, input)
    })
    this.creations = create.then(() => undefined, () => undefined)
    return create
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

export async function getBoard(stub: DurableObjectStub, userId: string) {
  const result = await boardTool<RecordResult<BoardFields>>(stub, userId, 'records.get', {
    collection: 'boards', recordId: BOARD_RECORD_ID,
  })
  if (result.success) return result.data.record
  if (result.error === RECORD_NOT_FOUND) return null
  throw new Error('Board lookup failed')
}
