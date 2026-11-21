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
      if (summaryCalls === 1) {
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
      return anthropicStream([{ type: 'text', text: '## Summary\n\nRun the pilot next week.' }])
    },
  },
  log: new Log(LogLevel.WARN),
}), resourcePersistencePath: ".spaceboard-runtime-data", log: new Log(LogLevel.WARN) })
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
  assert.deepEqual(record.data, { markdown: 'Updated together', color: 'lilac', x: 200, y: 220 })

  const presenceA = await socket('/ws/presence/board:' + board.id, a)
  const presenceB = await socket('/ws/presence/board:' + board.id, b)
  presenceA.send(MSG.PRESENCE_UPDATE, { state: { cursor: { x: 23, y: 101 } } })
  await presenceB.receive((event) => JSON.stringify(event).includes('"x":23') && JSON.stringify(event).includes('"userId":"author"'))

  const summary = await request(path + '/summary', 'POST', a, null, 200)
  assert.deepEqual(summary, { summary: '## Summary\n\nRun the pilot next week.', included: 1, total: 1 })
  assert.equal(summaryCalls, 2)
  await request(notePath, 'DELETE', b, null, 200)
  await request(notePath, 'DELETE', b, null, 200)
  await request(notePath, 'PATCH', b, { x: 1, y: 2 }, 404)
  await request(path + '/summary', 'POST', a, null, 400)
  console.log('Passed: auth guard, idempotent board and note creation, validation, shared access, WebSocket sync, cursor presence, persisted snapshot, and deletion.')
} finally {
  for (const socket of activeSockets) socket.close()
  await worker.dispose()
}
