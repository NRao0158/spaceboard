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
      if (JSON.stringify(payload.messages.at(-1)).includes('blind spots')) return fixtureStream([{ type: 'text', text: JSON.stringify({
        gaps: [{ title: 'Recruitment', detail: 'A team has not yet been selected.', prompt: 'Which team owns the pilot?', noteIds: [notes[0].id, randomUUID()] }],
      }) }])
      return fixtureStream([{ type: 'text', text: JSON.stringify({
        summary: 'Launch a focused pilot.',
        themes: [{ name: 'Pilot planning', detail: 'Align on a team and check-in.', noteIds: [notes[0].id, randomUUID()] }],
        nextSteps: ['Contact the pilot team.'],
      }) }])
    },
  },
}), cf: false, resourcePersistencePath: '.wrangler/ultimate-browser', log: new Log(LogLevel.WARN) })

let browser
try {
  const url = await worker.ready
  browser = await chromium.launch({ args: ['--no-sandbox'], executablePath: process.env.SPACEBOARD_CHROMIUM })
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
  const previewLine = a.locator('.sb-demo-thread > path')
  await expect(previewLine).toBeVisible(options)
  const initialPreviewLine = await previewLine.getAttribute('d')
  await a.getByRole('button', { name: 'Send preview emote' }).click()
  // Reduced motion still shows a short static burst.
  await expect(a.locator('.sb-demo-grid [data-emote]')).toHaveCount(1, options)
  await preview.click()
  await expect(preview).toHaveClass(/sb-paper-mint/, options)
  const start = await preview.boundingBox()
  await a.mouse.move(start.x + 30, start.y + 30)
  await a.mouse.down()
  await a.mouse.move(start.x + 88, start.y + 49, { steps: 10 })
  await a.mouse.up()
  assert((await preview.boundingBox()).x > start.x + 20)
  assert.notEqual(await previewLine.getAttribute('d'), initialPreviewLine)
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

  const editor = a.getByRole('textbox', { name: 'Note', exact: true })
  await a.keyboard.press('n')
  await expect(editor).toBeFocused(options)
  await editor.press('Escape')
  await expect(editor).toHaveCount(0, options)
  const area = await canvas.boundingBox()
  await canvas.dblclick({ position: { x: 910, y: 240 } })
  const draftBox = await a.locator('.sb-draft-note').boundingBox()
  assert(Math.abs(draftBox.x + draftBox.width / 2 - area.x - 910) < 4)
  assert(Math.abs(draftBox.y + draftBox.height / 2 - area.y - 240) < 4)
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
  await added.getByRole('button', { name: 'Mint', exact: true }).click()
  await expect(same.locator('.sb-note-sheet')).toHaveClass(/sb-paper-mint/, options)
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
  await expect(b.locator('[data-section-id]')).toHaveCount(1, options)
  await drawer.getByRole('button', { name: 'Undo layout' }).click()
  await expect(drawer.getByRole('button', { name: 'Undo layout' })).toHaveCount(0, options)
  await expect.poll(() => coords(a), options).toEqual(prior)
  await expect(a.locator('[data-section-id]')).toHaveCount(0, options)
  await expect(b.locator('[data-section-id]')).toHaveCount(0, options)
  await expect.poll(() => coords(b), options).toEqual(prior)
  await drawer.getByRole('button', { name: 'Find gaps', exact: true }).click()
  await drawer.getByRole('button', { name: 'Find gaps', exact: true }).last().click()
  await drawer.getByRole('button', { name: /Recruitment/ }).click(options)
  await expect(a.getByRole('button', { name: /Showing gap: Recruitment/ })).toBeVisible(options)
  await drawer.getByRole('button', { name: 'Drop as prompt note' }).click()
  await expect(notes(b).filter({ hasText: 'Which team owns the pilot?' })).toHaveCount(1, options)
  await drawer.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(drawer.getByRole('textbox', { name: 'Action brief Markdown' })).toHaveValue(/Action brief[\s\S]*Which team owns the pilot/, options)
  const downloadEvent = a.waitForEvent('download')
  await drawer.getByRole('button', { name: 'Download .md file' }).click()
  assert.equal((await downloadEvent).suggestedFilename(), 'product-kickoff-action-brief.md')
  await drawer.getByRole('button', { name: 'Close insights' }).click()
  console.log('PASS linked synthesis, theme sections and undo, grounded gaps, action note and Markdown download')

  await mobile.goto(boardUrl)
  await expect(notes(mobile)).toHaveCount(9, options)
  await expect(mobile.getByRole('group', { name: 'Studio tools' })).toBeVisible(options)
  await mobile.getByRole('button', { name: 'Fit to notes' }).click()
  assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
  await a.getByRole('link', { name: 'Boards', exact: true }).click()
  const recent = a.getByRole('region', { name: 'Recent on this device' })
  await expect(recent.getByText(/9 notes/)).toBeVisible(options)
  await recent.getByRole('button', { name: 'Remove Product Kickoff from recent boards' }).click()
  await expect(recent).toHaveCount(0)
  console.log('PASS mobile controls and recent board count/remove')
  await verifySpatialStudio(a, b, boardUrl, options)
} finally {
  await browser?.close()
  await worker.dispose()
}

async function verifySpatialStudio(a, b, boardUrl, options) {
  await a.goto(new URL('/home', boardUrl).href)
  await a.getByRole('button', { name: /Product Kickoff/ }).click(options)
  await a.waitForURL(/\/boards\//, options)
  const spatialUrl = a.url()
  await b.goto(spatialUrl)
  const canvasA = a.locator('.sb-studio-viewport')
  const worldA = a.locator('.sb-studio-world')
  const note = (page, title) => page.locator('[data-note-id]').filter({ hasText: title })
  const first = note(a, 'The outcome')
  const second = note(a, 'Who it serves')
  const firstB = note(b, 'The outcome')
  const secondB = note(b, 'Who it serves')
  for (const page of [a, b]) await expect(page.locator('[data-note-id]')).toHaveCount(6, options)
  await expect(a.getByRole('button', { name: '2 here' })).toBeVisible(options)

  const pos = (target) => target.evaluate((el) => [parseFloat(el.style.getPropertyValue('--note-x')), parseFloat(el.style.getPropertyValue('--note-y'))])
  const center = async (target) => {
    const rect = await target.boundingBox()
    assert(rect)
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
  }
  async function drag(from, to, release = true) {
    await a.mouse.move(from.x, from.y)
    await a.mouse.down()
    await a.mouse.move(to.x, to.y, { steps: 18 })
    if (release) await a.mouse.up()
  }
  const edgeA = a.locator('[data-edge-id]')
  const edgeB = b.locator('[data-edge-id]')
  await first.getByText('The outcome', { exact: true }).click()
  await drag(await center(first.getByRole('button', { name: 'Connect from right' })), await center(second.getByText('Who it serves', { exact: true })), false)
  await expect(a.locator('.sb-edge-preview')).toBeVisible(options)
  await a.mouse.up()
  await expect(edgeB).toHaveCount(1, options)
  const initialCurve = await edgeB.locator('.sb-edge-visible').getAttribute('d')
  const handle = await center(first.getByRole('button', { name: /Move note/ }))
  await a.keyboard.down('Alt')
  await drag(handle, { x: handle.x + 36, y: handle.y + 62 }, false)
  await expect(firstB).toHaveAttribute('data-remote', 'true', options)
  await expect(edgeB.locator('.sb-edge-visible')).not.toHaveAttribute('d', initialCurve, options)
  await a.mouse.up()
  await a.keyboard.up('Alt')
  await expect(firstB).toHaveAttribute('data-remote', 'false', options)
  const edgeButton = edgeA.getByRole('button')
  await edgeButton.focus()
  await edgeButton.press('Enter')
  const threadEditor = a.getByRole('form', { name: 'Edit idea thread' })
  await threadEditor.getByRole('textbox', { name: 'Thread label' }).fill('leads to')
  await threadEditor.getByRole('combobox', { name: 'Thread style' }).selectOption('dashed')
  await threadEditor.getByRole('button', { name: 'Save thread' }).click()
  await expect(edgeB.getByText('leads to')).toBeVisible(options)

  const area = await canvasA.boundingBox()
  await drag({ x: area.x + 4, y: area.y + 4 }, { x: area.x + 525, y: area.y + 247 }, false)
  await expect(a.locator('.sb-marquee')).toBeVisible(options)
  await a.mouse.up()
  const group = a.getByRole('group', { name: 'Selected notes actions' })
  await expect(group.getByText('2 selected')).toBeVisible(options)
  await group.getByRole('button', { name: 'Wrap in section' }).click()
  const frameA = a.locator('[data-section-id]')
  const frameB = b.locator('[data-section-id]')
  await expect(frameB).toHaveCount(1, options)
  const priorA = await pos(firstB)
  const priorB = await pos(secondB)
  const grip = await center(frameA.getByRole('button', { name: /Move section/ }))
  await drag(grip, { x: grip.x + 100, y: grip.y + 70 }, false)
  await expect(firstB).toHaveAttribute('data-remote', 'true', options)
  await expect(secondB).toHaveAttribute('data-remote', 'true', options)
  await a.mouse.up()
  await expect(firstB).toHaveAttribute('data-remote', 'false', options)
  await expect.poll(() => pos(firstB), options).toEqual(priorA.map((value, i) => value + [100, 70][i]))
  expect(await pos(secondB)).toEqual(priorB.map((value, i) => value + [100, 70][i]))

  await canvasA.focus()
  await a.keyboard.press('Control+z')
  await expect.poll(() => pos(firstB), options).toEqual(priorA)
  await a.keyboard.press('Control+Shift+z')
  await expect.poll(() => pos(firstB), options).toEqual(priorA.map((value, i) => value + [100, 70][i]))
  console.log('PASS live connector geometry and labels, marquee, wrapped section, group drag and history replay')

  await a.mouse.move(area.x + 880, area.y + 240)
  await a.keyboard.press('/')
  const chat = a.getByRole('textbox', { name: 'Cursor chat' })
  await chat.fill('Ready for the next round')
  await expect(b.locator('.sb-cursor-bubble[data-visible="true"]')).toHaveText('Ready for the next round', options)
  await chat.press('Enter')
  await expect(b.locator('.sb-cursor-bubble[data-visible="true"]')).toHaveCount(0, options)
  await a.keyboard.press('e')
  await a.keyboard.press('4')
  await expect(b.locator('[data-emote="🎉"]')).toHaveCount(1, options)

  await a.getByRole('button', { name: /^Brainstorm timer/ }).click()
  const timer = a.getByRole('group', { name: 'Brainstorm timer controls' })
  await timer.getByRole('button', { name: '3m' }).click()
  await expect(b.locator('[data-timer-count]')).toHaveText('03:00', options)
  await timer.getByRole('button', { name: 'Start', exact: true }).click()
  await expect(b.locator('[data-timer-count]')).toHaveText('02:59', options)
  await timer.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(timer.getByRole('button', { name: 'Start', exact: true })).toBeVisible(options)
  await expect(b.locator('[data-timer-count]')).toHaveText(await a.locator('[data-timer-count]').textContent(), options)

  const canvasB = await b.locator('.sb-studio-viewport').boundingBox()
  await b.mouse.move(canvasB.x + 850, canvasB.y + 320)
  const oldCamera = await worldA.evaluate((el) => el.style.transform)
  await a.getByRole('button', { name: '2 here' }).click()
  await a.getByRole('button', { name: 'Jules', exact: false }).first().click()
  await expect(a.getByRole('button', { name: /Following Jules/ })).toBeVisible(options)
  await expect.poll(() => worldA.evaluate((el) => el.style.transform), options).not.toEqual(oldCamera)
  await a.mouse.move(area.x + 600, area.y + 270)
  await a.mouse.wheel(0, 100)
  await expect(a.getByRole('button', { name: /Following Jules/ })).toHaveCount(0, options)

  await a.keyboard.press('Control+k')
  const palette = a.getByRole('combobox', { name: 'Search commands and boards' })
  await palette.fill('first experiment')
  await expect(a.getByRole('option', { name: /First experiment/ })).toBeVisible(options)
  await palette.press('Enter')
  await expect(note(a, 'First experiment')).toHaveAttribute('data-selected', 'true', options)
  await a.keyboard.press('z')
  await expect(a.getByTestId('app-navigation')).toBeHidden()
  await a.getByRole('button', { name: /Exit Zen/ }).click()
  await expect(a.getByTestId('app-navigation')).toBeVisible()
  console.log('PASS cursor chat, emote, synchronized timer, follow, palette jump and Zen mode')

  await a.getByRole('button', { name: 'Fit to notes' }).click()
  const target = first.getByText('The outcome', { exact: true })
  await target.click()
  const noteTools = first.getByRole('group', { name: 'Selected note actions' })
  await noteTools.getByRole('button', { name: 'Delete note', exact: true }).click()
  await noteTools.getByRole('button', { name: 'Confirm delete note' }).click()
  await expect(firstB).toHaveCount(0, options)
  await expect(edgeB).toHaveCount(0, options)
  await a.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(firstB).toHaveCount(1, options)
  await expect(edgeB.getByText('leads to')).toBeVisible(options)
  await a.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(firstB).toHaveCount(0, options)
  await expect(edgeB).toHaveCount(0, options)
  console.log('PASS note deletion cascades to its threads, then restores and replays across both sessions')

  const boardId = new URL(spatialUrl).pathname.split('/').at(-1)
  const url = new URL('/api/boards/' + boardId + '/notes', spatialUrl)
  const token = jwt('author', 'Maya')
  for (let index = 0; index < 40; index += 1) {
    const response = await a.request.post(url.href, {
      headers: { Authorization: 'Bearer ' + token },
      data: { key: randomUUID(), markdown: '## Workshop idea ' + (index + 1), color: 'lilac', x: 820 + index % 7 * 280, y: 400 + Math.floor(index / 7) * 255 },
    })
    assert(response.ok(), await response.text())
  }
  for (const page of [a, b]) await expect(page.locator('[data-note-id]')).toHaveCount(45, options)
  await a.bringToFront()
  const denseGrip = await center(second.getByRole('button', { name: /Move note/ }))
  await a.evaluate(() => {
    const times = []
    let prior
    function measure(time) {
      if (prior !== undefined) times.push(time - prior)
      prior = time
      window.spaceboardFrameSample = times
      if (times.length < 100) requestAnimationFrame(measure)
    }
    requestAnimationFrame(measure)
  })
  await drag(denseGrip, { x: denseGrip.x + 110, y: denseGrip.y + 55 }, false)
  await expect(secondB).toHaveAttribute('data-remote', 'true', options)
  await a.mouse.up()
  await expect(secondB).toHaveAttribute('data-remote', 'false', options)
  await expect.poll(() => a.evaluate(() => window.spaceboardFrameSample.length), options).toBeGreaterThan(12)
  const frames = await a.evaluate(() => window.spaceboardFrameSample.filter((ms) => ms > 0).sort((a, b) => a - b))
  console.log('PASS two-session drag with 45 notes, median frame interval ' + frames[Math.floor(frames.length / 2)].toFixed(1) + ' ms')
}
