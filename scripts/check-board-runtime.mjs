import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'
import { MSG } from 'deepspace'

const config = JSON.parse(readFileSync('dist/spaceboard_nihal/wrangler.json', 'utf8'))
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const issuer = 'https://spaceboard-test.invalid'

function token(id, name) {
  const blob = (data) => Buffer.from(JSON.stringify(data)).toString('base64url')
  const header = blob({ alg: 'ES256', typ: 'JWT' })
  const claims = blob({ sub: id, name, email: id + '@test.invalid', iss: issuer, exp: Math.floor(Date.now() / 1000) + 600 })
  const input = header + '.' + claims
  return input + '.' + sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
}

const a = token('author', 'Author')
const b = token('peer', 'Peer')
let summaryCalls = 0
let summarizedNoteId
function anthropicStream(content) {
  const events = [{ type: 'message_start', message: {
    id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5',
    content: [], usage: { input_tokens: 50, output_tokens: 0 },
    container: { id: 'container_test', expires_at: '2099-01-01T00:00:00Z' },
  } }]
  for (const [index, block] of content.entries()) {
    events.push({ type: 'content_block_start', index, content_block: block.type === 'text' ? { type: 'text', text: '' } : block })
    if (block.type === 'text') events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    events.push({ type: 'content_block_stop', index })
  }
  events.push({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null, container: { id: 'container_test', expires_at: '2099-01-01T00:00:00Z' } }, usage: { output_tokens: 12 } })
  events.push({ type: 'message_stop' })
  return new Response(events.map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
}
const worker = new Miniflare({ ...convertV4MiniflareOptions({
  modules: true,
  scriptPath: 'dist/spaceboard_nihal/index.js',
  compatibilityDate: config.compatibility_date,
  compatibilityFlags: config.compatibility_flags,
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(({ name, class_name }) => [name, { className: class_name, useSQLite: true }])),
  bindings: { ...config.vars, AUTH_JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }), AUTH_JWT_ISSUER: issuer, OWNER_USER_ID: 'author', APP_IDENTITY_TOKEN: 'signed-sandbox-test-fixture' },
  serviceBindings: {
    ASSETS: () => new Response(null, { status: 404 }),
    API_WORKER: async (request) => {
      assert.equal(request.headers.get('x-auth-token'), a)
      const payload = await request.json()
      summaryCalls++
      assert.equal(payload.stream, true)
      assert(JSON.stringify(payload.messages).includes('Updated together'))
      if (payload.tool_choice?.name === 'code_execution') {
        assert(payload.tools.some(tool => tool.name === 'code_execution'))
        assert.equal(payload.tool_choice.name, 'code_execution')
        // Regression: successful sandbox analysis with no text must still
        // trigger a second request for the user-facing answer.
        return anthropicStream([
        { type: 'server_tool_use', id: 'srvtoolu_mock', name: 'bash_code_execution', input: { command: 'echo 1' } },
        { type: 'bash_code_execution_tool_result', tool_use_id: 'srvtoolu_mock', content: { type: 'bash_code_execution_result', stdout: '1', stderr: '', return_code: 0, content: [] } },
        ])
      }
      // The Anthropic adapter removes tools when toolChoice is none.
      assert.equal(payload.tools, undefined)
      assert.equal(payload.container, 'container_test')
      assert(JSON.stringify(payload.messages).includes('srvtoolu_mock'))
      if (JSON.stringify(payload.messages.at(-1)).includes('blind spots')) return anthropicStream([{ type: 'text', text: JSON.stringify({
        gaps: [{ title: 'Timing', detail: 'No date selected.', prompt: 'When do you start?', noteIds: [summarizedNoteId, randomUUID()] }],
      }) }])
      return anthropicStream([{ type: 'text', text: JSON.stringify({
        summary: 'Run the pilot next week.',
        themes: [{ name: 'Pilot', detail: 'Try one team.', noteIds: [summarizedNoteId, summarizedNoteId, randomUUID(), 'invalid'] }],
        nextSteps: ['Confirm the team.'],
      }) }])
    },
  },
  log: new Log(LogLevel.WARN),
}), cf: false, resourcePersistencePath: '.wrangler/ultimate-runtime', log: new Log(LogLevel.WARN) })
const activeSockets = []

async function request(path, method, auth, data, expected) {
  const res = await worker.dispatchFetch('http://localhost' + path, {
    method, headers: { ...(auth && { Authorization: 'Bearer ' + auth }), ...(data && { 'Content-Type': 'application/json' }) },
    body: data && JSON.stringify(data),
  })
  const body = await res.json()
  assert.equal(res.status, expected, method + ' ' + path + ' ' + JSON.stringify(body))
  return body
}
async function socket(path, auth, expected = 101) {
  const url = new URL(path, 'http://localhost')
  if (auth) url.searchParams.set('token', auth)
  const response = await worker.dispatchFetch(url.toString(), { headers: { Upgrade: 'websocket' } })
  assert.equal(response.status, expected, path)
  if (!response.webSocket) return null
  const ws = response.webSocket
  activeSockets.push(ws)
  const buffer = []
  const listeners = new Set()
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    buffer.push(message)
    for (const listener of listeners) listener(message)
  })
  ws.accept()
  return {
    send: (type, payload) => ws.send(JSON.stringify({ type, payload })),
    receive: (match) => new Promise((resolve, reject) => {
      const initial = buffer.find(match)
      if (initial) return resolve(initial)
      const watch = (message) => {
        if (!match(message)) return
        clearTimeout(timer)
        listeners.delete(watch)
        resolve(message)
      }
      const timer = setTimeout(() => {
        listeners.delete(watch)
        reject(new Error(path + ' timed out, received ' + JSON.stringify(buffer)))
      }, 4000)
      listeners.add(watch)
    }),
  }
}
const base = '/api/boards'
try {
  await worker.ready
  await request(base, 'POST', null, { key: randomUUID(), title: 'Kickoff' }, 401)
  const create = { key: randomUUID(), title: 'Kickoff' }
  const boards = await Promise.all([request(base, 'POST', a, create, 201), request(base, 'POST', a, create, 201)])
  const board = boards[0]
  assert.deepEqual(board, boards[1])
  const path = base + '/' + board.id
  assert.equal((await request(path, 'GET', b, null, 200)).title, 'Kickoff')
  await request(path, 'GET', null, null, 401)
  await request(base + '/' + randomUUID(), 'GET', a, null, 404)
  await socket('/ws/board:' + board.id, null, 401)
  await socket('/ws/presence/board:' + randomUUID(), a, 404)

  const wsA = await socket('/ws/board:' + board.id, a)
  const wsB = await socket('/ws/board:' + board.id, b)
  for (const [index, client] of [wsA, wsB].entries()) {
    client.send(MSG.SUBSCRIBE, { subscriptionId: 'notes-' + index, query: { collection: 'notes' } })
    const empty = await client.receive((event) => event.type === MSG.QUERY_RESULT)
    assert.deepEqual(empty.payload.records, [])
  }
  const note = { key: randomUUID(), markdown: '## Plan\n\nTry a pilot.', color: 'mint', x: 30, y: 40 }
  await request(path + '/notes', 'POST', b, { ...note, x: -1 }, 400)
  const saved = await request(path + '/notes', 'POST', a, note, 201)
  await wsB.receive((event) => event.type === MSG.RECORD_CHANGE && JSON.stringify(event).includes(saved.id))

  const notePath = path + '/notes/' + saved.id
  await request(notePath, 'PATCH', b, { markdown: 'Updated together', color: 'lilac' }, 200)
  await request(notePath, 'PATCH', a, { x: 200, y: 220 }, 200)
  await request(path + '/notes', 'POST', a, note, 201)
  const revisited = await socket('/ws/board:' + board.id, a)
  revisited.send(MSG.SUBSCRIBE, { subscriptionId: 'fresh-tab', query: { collection: 'notes' } })
  const snapshot = await revisited.receive((event) => event.type === MSG.QUERY_RESULT)
  assert.equal(snapshot.payload.records.length, 1)
  const record = snapshot.payload.records[0]
  assert.equal(record.createdBy, 'author')
  const { reactions, ...originalFields } = record.data
  assert.equal(reactions ?? '', '')
  assert.deepEqual(originalFields, { markdown: 'Updated together', color: 'lilac', x: 200, y: 220 })

  const reactionPath = notePath + '/reaction'
  await request(reactionPath, 'PUT', null, { kind: 'like', active: true }, 401)
  await request(reactionPath, 'PUT', b, { kind: 'like', active: true, userId: 'author' }, 400)
  await Promise.all([
    request(reactionPath, 'PUT', a, { kind: 'like', active: true }, 200),
    request(reactionPath, 'PUT', b, { kind: 'like', active: true }, 200),
    request(reactionPath, 'PUT', a, { kind: 'like', active: true }, 200),
  ])
  const votes = await request(reactionPath, 'PUT', a, { kind: 'like', active: false }, 200)
  assert.deepEqual(votes.reactions, [{ userId: 'peer', kind: 'like' }])
  await wsB.receive((event) => event.type === MSG.RECORD_CHANGE && JSON.stringify(event).includes('reactions'))

  const presenceA = await socket('/ws/presence/board:' + board.id, a)
  const presenceB = await socket('/ws/presence/board:' + board.id, b)
  presenceA.send(MSG.PRESENCE_UPDATE, { state: {
    cursor: { x: 23, y: 101 }, dragging: { noteId: saved.id, x: 50, y: 70 }, editingNoteId: saved.id,
  } })
  await presenceB.receive((event) => JSON.stringify(event).includes('"editingNoteId":"' + saved.id + '"'))
  await presenceB.receive((event) => JSON.stringify(event).includes('"x":23') && JSON.stringify(event).includes('"userId":"author"'))

  summarizedNoteId = saved.id
  const summary = await request(path + '/summary', 'POST', a, null, 200)
  assert.deepEqual(summary, {
    summary: 'Run the pilot next week.',
    themes: [{ name: 'Pilot', detail: 'Try one team.', noteIds: [saved.id] }],
    nextSteps: ['Confirm the team.'], included: 1, total: 1,
  })
  assert.equal(summaryCalls, 2)
  const gaps = await request(path + '/gaps', 'POST', a, null, 200)
  assert.deepEqual(gaps, { gaps: [{ title: 'Timing', detail: 'No date selected.', prompt: 'When do you start?', noteIds: [saved.id] }], included: 1, total: 1 })
  assert.equal(summaryCalls, 4)
  await request(path + '/summary', 'POST', null, null, 401)
  await request(path + '/timer', 'PUT', null, { action: 'start' }, 401)
  await request(path + '/timer', 'PUT', b, { action: 'start', startedBy: 'author' }, 400)
  const started = await request(path + '/timer', 'PUT', b, { action: 'start', duration: 180 }, 200)
  assert.equal(started.timer.startedBy, 'peer')
  assert.equal(started.timer.endsAt, started.serverNow + 180_000)
  const paused = await request(path + '/timer', 'PUT', a, { action: 'pause' }, 200)
  assert.equal(paused.timer.status, 'paused')
  assert(paused.timer.remainingMs > 179_000 && paused.timer.remainingMs <= 180_000)

  const second = await request(path + '/notes', 'POST', b, { ...note, key: randomUUID(), x: 510, markdown: 'Other side of the thread' }, 201)
  const edge = { id: randomUUID(), fromNoteId: saved.id, toNoteId: second.id, style: 'dashed', label: 'leads to' }
  const frame = { id: randomUUID(), title: 'Pilot', x: 150, y: 165, width: 670, height: 330, color: 'indigo' }
  const studio = (ops, who = a, status = 200) => request(path + '/studio', 'POST', who, { ops }, status)
  await studio([{ kind: 'edge.put', edge }], null, 401)
  await studio([{ kind: 'edge.put', edge: { ...edge, toNoteId: randomUUID() } }], a, 409)
  await studio([{ kind: 'edge.put', edge: { ...edge, createdBy: 'peer' } }], a, 400)

  const saveLayout = await studio([
    { kind: 'note.patch', id: saved.id, set: { x: 250, y: 320 } },
    { kind: 'section.put', section: frame },
    { kind: 'edge.put', edge },
  ])
  const redo = await studio(saveLayout.inverse)
  await studio(redo.inverse)
  await studio([{ kind: 'note.patch', id: saved.id, set: { x: 50, y: 20 }, expect: { x: 350, y: 320 } }], b, 409)
  const deletion = await studio([{ kind: 'note.delete', id: saved.id }], b)

  async function boardState(room, tag) {
    const watcher = await socket('/ws/board:' + room, a)
    watcher.send(MSG.SUBSCRIBE, { subscriptionId: tag, query: { collection: 'boards' } })
    const response = await watcher.receive((event) => event.type === MSG.QUERY_RESULT)
    return response.payload.records[0].data
  }
  assert.deepEqual(JSON.parse((await boardState(board.id, 'deleted')).edges), [])
  await studio(deletion.inverse, a, 409)
  await studio(deletion.inverse, b)
  await studio(deletion.inverse, b, 409)
  const restoredBoard = await boardState(board.id, 'restored')
  assert.deepEqual(JSON.parse(restoredBoard.edges), [{ ...edge, createdBy: 'author' }])
  assert.deepEqual(JSON.parse(restoredBoard.sections), [frame])
  const finalNotes = await socket('/ws/board:' + board.id, a)
  finalNotes.send(MSG.SUBSCRIBE, { subscriptionId: 'restored-notes', query: { collection: 'notes' } })
  const final = (await finalNotes.receive((event) => event.type === MSG.QUERY_RESULT)).payload.records.find((item) => item.recordId === saved.id)
  assert.equal(final.createdBy, 'author')
  assert.deepEqual(JSON.parse(final.data.reactions), [{ userId: 'peer', kind: 'like' }])
  await request(path + '/notes/' + second.id, 'DELETE', b, null, 200)
  assert.deepEqual(JSON.parse((await boardState(board.id, 'legacy-deleted')).edges), [])
  await request(notePath, 'DELETE', b, null, 200)
  await request(notePath, 'DELETE', b, null, 200)
  await request(notePath, 'PATCH', b, { x: 1, y: 2 }, 404)
  await request(path + '/summary', 'POST', a, null, 400)
  console.log('Passed: auth guard, idempotent board and note creation, validation, shared access, WebSocket sync, cursor, editing, drag presence, reactions, structured sandbox insights, persisted snapshot, section and timer state, two AI modes, guarded undo, and connector cascade.')
} finally {
  for (const socket of activeSockets) socket.close()
  await worker.dispose()
}
