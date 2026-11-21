import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { resolve, sep, extname } from 'node:path'
import { generateKeyPairSync, sign, randomUUID } from 'node:crypto'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'
import { chromium, expect } from '@playwright/test'

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const issuer = 'https://spaceboard-ui-check.invalid'
const config = JSON.parse(readFileSync('dist/spaceboard_nihal/wrangler.json', 'utf8'))
const assets = resolve('dist/client')
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.ico': 'image/x-icon' }
const b64 = (data) => Buffer.from(JSON.stringify(data)).toString('base64url')

function jwt(id, name) {
  const claims = { sub: id, name, email: id + '@test.invalid', iss: issuer, exp: Math.floor(Date.now() / 1000) + 600 }
  const input = b64({ alg: 'ES256' }) + '.' + b64(claims)
  return input + '.' + sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url')
}

function fixtureStream(blocks) {
  const container = { id: 'container_ui', expires_at: '2099-01-01T00:00:00Z' }
  const events = [{ type: 'message_start', message: {
    id: 'msg_ui', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [], usage: { input_tokens: 100, output_tokens: 0 }, container,
  } }]
  for (const [index, block] of blocks.entries()) {
    events.push({ type: 'content_block_start', index, content_block: block.type === 'text' ? { type: 'text', text: '' } : block })
    if (block.type === 'text') events.push({ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } })
    events.push({ type: 'content_block_stop', index })
  }
  events.push({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null, container }, usage: { output_tokens: 100 } }, { type: 'message_stop' })
  return new Response(events.map((event) => 'event: ' + event.type + '\ndata: ' + JSON.stringify(event) + '\n\n').join(''), {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const worker = new Miniflare({ ...convertV4MiniflareOptions({
  modules: true, scriptPath: 'dist/spaceboard_nihal/index.js',
  compatibilityDate: config.compatibility_date, compatibilityFlags: config.compatibility_flags,
  durableObjects: Object.fromEntries(config.durable_objects.bindings.map(({ name, class_name }) => [name, { className: class_name, useSQLite: true }])),
  bindings: {
    ...config.vars, AUTH_JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }),
    AUTH_JWT_ISSUER: issuer, AUTH_WORKER_URL: issuer, OWNER_USER_ID: 'author', APP_IDENTITY_TOKEN: 'sandbox-ui-fixture',
  },
  serviceBindings: {
    ASSETS: (request) => {
      const pathname = new URL(request.url).pathname
      const file = resolve(assets, '.' + (pathname === '/' ? '/index.html' : pathname))
      try {
        if (!file.startsWith(assets + sep) || !statSync(file).isFile()) return new Response(null, { status: 404 })
        return new Response(readFileSync(file), { headers: { 'Content-Type': mime[extname(file)] ?? 'application/octet-stream' } })
      } catch { return new Response(null, { status: 404 }) }
    },
    API_WORKER: async (request) => {
      const payload = await request.json()
      if (payload.tool_choice?.name === 'code_execution') return fixtureStream([
        { type: 'server_tool_use', id: 'srvtoolu_ui', name: 'bash_code_execution', input: { command: 'echo 1' } },
        { type: 'bash_code_execution_tool_result', tool_use_id: 'srvtoolu_ui', content: { type: 'bash_code_execution_result', stdout: '1', stderr: '', return_code: 0, content: [] } },
      ])
      const first = payload.messages[0].content
      const { notes } = JSON.parse(typeof first === 'string' ? first : first.find(({ type }) => type === 'text').text)
      return fixtureStream([{ type: 'text', text: JSON.stringify({
        summary: 'Launch a focused pilot.',
        themes: [{ name: 'Pilot planning', detail: 'Align on a team and check-in.', noteIds: [notes[0].id, randomUUID()] }],
        nextSteps: ['Contact the pilot team.'],
      }) }])
    },
  },
}), log: new Log(LogLevel.WARN) })

let browser
try {
  const url = await worker.ready
  browser = await chromium.launch({ args: ['--no-sandbox'] })
  const options = { timeout: 20000 }
  async function session(id, name, viewport) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 600000).toISOString()
    const token = jwt(id, name)
    const user = { id, name, email: id + '@test.invalid', emailVerified: true, createdAt: now, updatedAt: now }
    await context.route('**/api/auth/**', (route) => {
      const path = new URL(route.request().url()).pathname
      return route.fulfill({ json: path.endsWith('/token') ? { token } : path.endsWith('/get-session')
        ? { user, session: { id: 'session-' + id, token: 'dummy', userId: id, expiresAt, createdAt: now, updatedAt: now } }
        : { user } })
    })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error('Browser error:', error.message))
    page.on('response', (response) => { if (response.status() >= 400 && response.url().includes('/api/boards')) console.error(response.status(), new URL(response.url()).pathname) })
    return page
  }

  const a = await session('author', 'Maya', { width: 1280, height: 840 })
  const b = await session('peer', 'Jules', { width: 1280, height: 840 })
  const mobile = await session('mobile', 'Sam', { width: 390, height: 840 })
  await a.goto(new URL('/', url).href)
  const preview = a.getByRole('button', { name: /^Start small/ })
  await expect(preview).toHaveClass(/sb-paper-lemon/, options)
  await preview.click()
  await expect(preview).toHaveClass(/sb-paper-mint/, options)
  const start = await preview.boundingBox()
  await a.mouse.move(start.x + 30, start.y + 30)
  await a.mouse.down()
  await a.mouse.move(start.x + 88, start.y + 49, { steps: 10 })
  await a.mouse.up()
  assert((await preview.boundingBox()).x > start.x + 20)
  assert.equal(await a.getByRole('link', { name: 'Open workspace' }).count(), 2)
  console.log('PASS landing hydration, note drag, color and CTA count')

  await a.goto(new URL('/home', url).href)
  await a.getByRole('button', { name: /Product Kickoff/ }).click(options)
  await a.waitForURL(/\/boards\//, options)
  const boardUrl = a.url()
  const canvas = a.locator('.sb-studio-viewport')
  const notes = (page) => page.locator('[data-note-id]')
  await expect(notes(a)).toHaveCount(6, options)
  await expect(a.getByRole('checkbox', { name: 'Open task' })).toHaveCount(2, options)
  await b.goto(boardUrl)
  await expect(notes(b)).toHaveCount(6, options)
  await expect(a.getByRole('button', { name: '2 here' })).toBeVisible(options)
  await a.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(a.getByRole('button', { name: /currently 115 percent/ })).toBeVisible(options)
  await a.getByRole('button', { name: 'Pan mode' }).click()
  const beforePan = await a.locator('.sb-studio-world').evaluate((el) => el.style.transform)
  const rect = await canvas.boundingBox()
  await a.mouse.move(rect.x + rect.width - 80, rect.y + 210)
  await a.mouse.down()
  await a.mouse.move(rect.x + rect.width - 180, rect.y + 155, { steps: 8 })
  await a.mouse.up()
  assert.notEqual(await a.locator('.sb-studio-world').evaluate((el) => el.style.transform), beforePan)
  await a.getByRole('button', { name: 'Select mode' }).click()
  const map = a.getByRole('group', { name: /Canvas overview/ })
  const mapBox = await map.boundingBox()
  await a.mouse.click(mapBox.x + mapBox.width * .85, mapBox.y + mapBox.height * .8)
  await expect(a.locator('.sb-studio-world')).not.toHaveAttribute('style', /translate\(0px,0px\)/)
  await a.getByRole('button', { name: 'Fit to notes' }).click()
  await a.getByRole('button', { name: 'Use obsidian theme' }).click()
  await expect(a.locator('.sb-studio-canvas')).toHaveAttribute('data-theme', 'dark')
  await a.reload()
  await expect(a.locator('.sb-studio-canvas')).toHaveAttribute('data-theme', 'dark', options)
  await expect(notes(a)).toHaveCount(6, options)
  console.log('PASS templates, note Markdown, zoom, pan, minimap and theme persistence')

  await canvas.dblclick({ position: { x: 910, y: 240 } })
  const editor = a.getByRole('textbox', { name: 'Note', exact: true })
  await expect(editor).toBeFocused(options)
  await editor.fill('## UI test note\n\n**Pilot** with one team.\n\n- [x] Done')
  await editor.press('Control+Enter')
  await expect(notes(b)).toHaveCount(7, options)
  const added = notes(a).filter({ hasText: 'UI test note' })
  const same = notes(b).filter({ hasText: 'UI test note' })
  const originalLeft = await added.evaluate((el) => el.style.getPropertyValue('--note-x'))
  const handle = added.getByRole('button', { name: /Move note/ })
  const grip = await handle.boundingBox()
  await a.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await a.mouse.down()
  await a.mouse.move(grip.x - 80, grip.y + 60, { steps: 15 })
  await expect(same).toHaveAttribute('data-remote', 'true', options)
  const ghostLeft = await same.evaluate((el) => el.style.getPropertyValue('--note-x'))
  assert.notEqual(ghostLeft, originalLeft)
  await a.mouse.up()
  await expect(same).toHaveAttribute('data-remote', 'false', options)
  await expect.poll(async () => same.evaluate((el) => el.style.getPropertyValue('--note-x')), options)
    .toBe(await added.evaluate((el) => el.style.getPropertyValue('--note-x')))

  await added.getByRole('button', { name: 'Edit note', exact: true }).click()
  await expect(same.getByText('Maya is editing…')).toBeVisible(options)
  await editor.fill('## UI test note\n\nUpdated live.')
  await editor.press('Control+Enter')
  await expect(same.getByText('Updated live.')).toBeVisible(options)
  await expect(same.getByText('Maya is editing…')).toHaveCount(0, options)
  await added.getByRole('button', { name: 'like reaction, 0 votes' }).click()
  await expect(same.getByRole('button', { name: 'like reaction, 1 votes' })).toHaveAttribute('aria-pressed', 'false', options)
  await b.getByRole('button', { name: 'Fit to notes' }).click()
  await same.getByRole('button', { name: 'like reaction, 1 votes' }).click()
  await expect(added.getByRole('button', { name: 'like reaction, 2 votes' })).toHaveAttribute('aria-pressed', 'true', options)
  await a.getByRole('button', { name: 'Top voted notes' }).click()
  await expect(added).toHaveAttribute('data-highlighted', 'true', options)
  await a.getByRole('button', { name: /Top voted.*Clear/ }).click()
  console.log('PASS note creation, inline edits, live drag, editor presence and two-user reactions')

  const coords = (page) => notes(page).evaluateAll((elements) =>
    elements.map((el) => [el.dataset.noteId, el.style.getPropertyValue('--note-x'), el.style.getPropertyValue('--note-y')]).sort())
  await a.getByRole('button', { name: 'Summarize board' }).click()
  const drawer = a.getByRole('complementary', { name: 'Board insights' })
  await expect(drawer.getByText('Based on 7 of 7 notes')).toBeVisible(options)
  await drawer.getByRole('button', { name: /Pilot planning/ }).click()
  await expect(a.getByRole('button', { name: /Showing theme: Pilot planning/ })).toBeVisible(options)
  await expect(a.locator('[data-dimmed="true"]')).toHaveCount(6, options)
  await drawer.getByRole('button', { name: 'Add to board' }).click()
  await expect(notes(b)).toHaveCount(8, options)
  await expect(notes(a)).toHaveCount(8, options)
  const prior = await coords(a)
  await drawer.getByRole('button', { name: 'Arrange by theme' }).click()
  await expect(drawer.getByRole('button', { name: 'Undo layout' })).toBeEnabled(options)
  assert.notDeepEqual(await coords(a), prior)
  await drawer.getByRole('button', { name: 'Undo layout' }).click()
  await expect(drawer.getByRole('button', { name: 'Undo layout' })).toHaveCount(0, options)
  assert.deepEqual(await coords(a), prior)
  await expect.poll(() => coords(b), options).toEqual(prior)
  console.log('PASS insights, theme spotlight, action note, shared clustering and exact undo')

  await mobile.goto(boardUrl)
  await expect(notes(mobile)).toHaveCount(8, options)
  await expect(mobile.getByRole('group', { name: 'Studio tools' })).toBeVisible(options)
  await mobile.getByRole('button', { name: 'Fit to notes' }).click()
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await a.getByRole('link', { name: 'Boards', exact: true }).click()
  const recent = a.getByRole('region', { name: 'Recent on this device' })
  await expect(recent.getByText(/8 notes/)).toBeVisible(options)
  await recent.getByRole('button', { name: 'Remove Product Kickoff from recent boards' }).click()
  await expect(recent).toHaveCount(0)
  console.log('PASS mobile controls and recent board count/remove')
} finally {
  await browser?.close()
  await worker.dispose()
}
