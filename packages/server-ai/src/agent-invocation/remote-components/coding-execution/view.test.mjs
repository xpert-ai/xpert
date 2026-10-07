import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const script = readFileSync(new URL('./app.js', import.meta.url), 'utf8')
const at = '2026-10-07T04:00:00.000Z'
const tool = (seq, output = '中文输出', status = 'running') => ({
    id: 'command',
    seq,
    firstSeq: 1,
    observedAt: at,
    content: {
        kind: 'tool',
        name: 'Shell',
        status,
        detail: {
            type: 'command',
            command: 'node check.mjs',
            outputMode: 'merged',
            ...(status === 'succeeded' ? { exitCode: 0 } : {})
        },
        output
    }
})
const message = (id, seq, text) => ({ id, seq, firstSeq: seq, observedAt: at, content: { kind: 'message', text } })
const snapshot = (items, status = 'running', state = 'recording', result) => ({
    item: {
        execution: { id: 'run', provider: 'test', status, createdAt: at, updatedAt: at, result },
        activity: { items, state, gaps: [], hasMore: false, nextCursor: Math.max(0, ...items.map((item) => item.seq)) }
    }
})
function harness() {
    const dom = new JSDOM('<div id="root"></div>', {
        url: 'http://localhost/',
        runScripts: 'outside-only',
        pretendToBeVisual: true
    })
    const w = dom.window
    w.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 20 })
    w.HTMLElement.prototype.scrollIntoView = () => {}
    w.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    const requests = []
    w.postMessage = (message) => {
        requests.push(message)
    }
    let nextTimer = 0
    const timers = new Map()
    w.setTimeout = (fn, delay) => {
        timers.set(++nextTimer, { fn, delay })
        return nextTimer
    }
    w.clearTimeout = (id) => timers.delete(id)
    w.eval(script)
    const receive = (data) =>
        w.dispatchEvent(
            new w.MessageEvent('message', {
                source: w,
                data: { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'test-view', ...data }
            })
        )
    const init = (extra = {}) =>
        receive({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId: 'run' }, scopeRevision: 1, ...extra })
    const reply = async (data, type = 'requestData') => {
        const request = requests.filter((item) => item.type === type).at(-1)
        assert.ok(request, `Missing ${type}`)
        receive({ type: 'response', requestId: request.requestId, data })
        await new Promise((resolve) => setImmediate(resolve))
    }
    const poll = async () => {
        const timer = [...timers].find(
            ([, timer]) => timer.delay === 2000 || timer.delay === 50 || timer.delay === 5000
        )
        assert.ok(timer, 'No polling timer')
        timers.delete(timer[0])
        timer[1].fn()
        await new Promise((resolve) => setImmediate(resolve))
    }
    const $ = (selector) => w.document.querySelector(selector)
    init()
    return { w, dom, $, reply, poll, init, receive, requests, timers }
}

test('upserts keep row/text nodes, disclosure, focus, paused scrolling and prevent stale revisions', async () => {
    const h = harness()
    try {
        await h.reply(snapshot([tool(1)]))
        const row = h.$('[data-record-id="command"]'),
            details = row.querySelector('details'),
            node = row.querySelector('.command-output').firstChild
        details.open = false
        row.focus()
        h.$('.header-actions button:nth-of-type(2)').click()
        h.$('.transcript-scroll').scrollTop = 140
        await h.poll()
        await h.reply(snapshot([tool(2, '中文输出\n完成', 'succeeded')], 'succeeded', 'closed'))
        assert.equal(h.$('[data-record-id="command"]'), row)
        assert.equal(row.querySelector('.command-output').firstChild, node)
        assert.equal(node.textContent, '中文输出\n完成')
        assert.equal(details.open, false)
        assert.equal(h.w.document.activeElement, row)
        assert.equal(h.$('.transcript-scroll').scrollTop, 140)
        assert.equal(h.$('.execution-status').textContent, '执行成功')
        assert.equal(h.$('.exit-code').textContent, '退出码 0')
        assert.equal(
            [...h.timers.values()].some((t) => t.delay === 2000),
            false
        )
    } finally {
        h.dom.window.close()
    }
})

test('selected content stays intact during a terminal update and flushes when selection clears', async () => {
    const h = harness()
    try {
        await h.reply(snapshot([tool(1)]))
        const node = h.$('.command-output').firstChild
        const range = h.w.document.createRange()
        range.setStart(node, 0)
        range.setEnd(node, 2)
        h.w.getSelection().addRange(range)
        h.w.document.dispatchEvent(new h.w.Event('selectionchange'))
        await h.poll()
        await h.reply(snapshot([tool(2, '中文输出\n新增结果', 'succeeded')], 'succeeded', 'closed'))
        assert.equal(h.w.getSelection().toString(), '中文')
        assert.equal(node.textContent, '中文输出')
        assert.equal(h.$('.execution-status').textContent, '执行成功')
        h.w.getSelection().removeAllRanges()
        h.w.document.dispatchEvent(new h.w.Event('selectionchange'))
        assert.equal(node.textContent, '中文输出\n新增结果')
    } finally {
        h.dom.window.close()
    }
})

test('terminal execution continues polling until capture closes; repeated updates do not duplicate rows or summary', async () => {
    const h = harness()
    try {
        await h.reply(snapshot([tool(1)], 'succeeded', 'recording'))
        await h.poll()
        await h.reply(
            snapshot([tool(2, '完成', 'succeeded'), message('final', 3, '任务\n完成')], 'succeeded', 'closed', {
                text: '任务 完成'
            })
        )
        assert.equal(h.$('.final-summary').hidden, true)
        assert.equal(h.w.document.querySelectorAll('.activity-record').length, 2)
        h.init({ locale: 'en-US' })
        assert.equal(h.$('.execution-status').textContent, 'Succeeded')
        assert.equal(h.w.document.querySelectorAll('.activity-record').length, 2)
    } finally {
        h.dom.window.close()
    }
})

test('search reveals long output without rebuilding nodes and keyboard navigation works', async () => {
    const h = harness()
    try {
        await h.reply(
            snapshot([
                tool(1, Array.from({ length: 80 }, (_, i) => `记录 ${i}`).join('\n')),
                message('next', 2, '公开回复')
            ])
        )
        const row = h.$('.activity-record'),
            node = h.$('.command-output').firstChild
        assert.equal(h.$('.command-output').textContent.includes('记录 79'), false)
        h.$('.header-actions button').click()
        const input = h.$('input[type="search"]')
        input.value = '记录 79'
        input.dispatchEvent(new h.w.Event('input'))
        assert.equal(h.$('.command-output').firstChild, node)
        assert.match(h.$('.search-count').textContent, /1 \/ 1/)
        assert.ok(h.$('.command-output').textContent.includes('记录 79'))
        input.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        assert.equal(h.$('.search-bar').hidden, true)
        row.focus()
        row.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        assert.equal(h.w.document.activeElement.dataset.recordId, 'next')
    } finally {
        h.dom.window.close()
    }
})

test('themes and same-target init preserve state; scope change clears records and ignores old responses', async () => {
    const h = harness()
    try {
        await h.reply(snapshot([tool(1)]))
        const theme = h.$('[role="combobox"]')
        assert.equal(theme.tagName, 'BUTTON')
        assert.equal(theme.dataset.slot, 'select-trigger')
        theme.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
        await new Promise((resolve) => setImmediate(resolve))
        const option = [...h.w.document.querySelectorAll('[role="option"]')].find((node) => node.textContent === '深蓝')
        assert.ok(option, 'shadcn Select exposes theme options')
        option.focus()
        await h.poll()
        await h.reply(snapshot([tool(2, '中文输出更新')]))
        assert.equal(h.w.document.activeElement, option)
        assert.equal(h.$('[role="combobox"]').getAttribute('aria-expanded'), 'true')
        option.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        await new Promise((resolve) => setImmediate(resolve))
        const row = h.$('.activity-record')
        h.init()
        assert.equal(h.$('.execution-view').dataset.palette, 'navy')
        assert.equal(h.$('.activity-record'), row)
        assert.equal(h.$('[role="combobox"]'), theme)
        await h.poll()
        const old = h.requests.at(-1)
        h.receive({
            type: 'hostEvent',
            event: { type: 'view.context.changed', data: { revision: 2, runtimeScope: {} } }
        })
        h.receive({ type: 'response', requestId: old.requestId, data: snapshot([tool(2)]) })
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(h.w.document.querySelectorAll('.activity-record').length, 0)
        assert.equal(h.$('.execution-view').dataset.palette, 'navy')
    } finally {
        h.dom.window.close()
    }
})

test('copy fallback succeeds on the first click; markup stays inert', async () => {
    const h = harness()
    try {
        await h.reply(snapshot([tool(1, '<img src=x onerror=alert(1)>中文')]))
        let copied = ''
        h.w.document.execCommand = (command) => {
            assert.equal(command, 'copy')
            copied = h.w.document.activeElement.value
            return true
        }
        h.$('.output-actions button').click()
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(copied, '<img src=x onerror=alert(1)>中文')
        assert.equal(h.$('.command-output img'), null)
        assert.equal(h.$('.copy-status').textContent, '已复制')
        h.$('.header-actions button[aria-label="复制过程"]').click()
        await new Promise((resolve) => setImmediate(resolve))
        assert.ok(copied.includes('$ node check.mjs'))
        assert.ok(copied.includes('<img src=x onerror=alert(1)>中文'))
    } finally {
        h.dom.window.close()
    }
})

test('errors preserve readable rows; output paging and downloads use existing authorized requests', async () => {
    const h = harness()
    try {
        const item = tool(1, '开始\n')
        item.content.outputRef = { key: 'a'.repeat(64), length: 12 }
        await h.reply(
            snapshot([item], 'running', 'recording', {
                text: '',
                artifacts: [{ id: 'file', versionId: 'v1', name: '结果.json' }]
            })
        )
        const row = h.$('.activity-record')
        await h.poll()
        h.receive({ type: 'error', requestId: h.requests.at(-1).requestId, message: 'offline' })
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(h.$('.activity-record'), row)
        assert.equal(h.$('.connection-notice').hidden, false)
        const more = [...h.w.document.querySelectorAll('button')].find((b) => b.textContent === '加载更多')
        more.click()
        assert.deepEqual(JSON.parse(JSON.stringify(h.requests.at(-1).query.parameters)), {
            outputKey: 'a'.repeat(64),
            offset: 3
        })
        await h.reply({ item: { output: { text: '结束\n', nextOffset: 6, hasMore: false } } })
        assert.equal(h.$('.command-output').textContent, '开始\n结束\n')
        h.$('.artifacts button').click()
        assert.equal(h.requests.at(-1).type, 'requestFileAccess')
        assert.equal(h.requests.at(-1).fileKey, 'file')
        assert.equal(h.requests.at(-1).targetId, 'run')
        assert.equal(h.requests.at(-1).purpose, 'download')
    } finally {
        h.dom.window.close()
    }
})

const jsonNode = (h, path, scope = '') => h.$(`${scope} [data-json-path="${path}"]`)
const jsonBranch = (h, path, scope = '') => jsonNode(h, path, scope).querySelector(':scope > details')
const jsonValue = (h, path, scope = '') => jsonNode(h, path, scope).querySelector(':scope > .json-leaf .json-value')

test('validated SDK summaries show once with a collapsed JSON tree; generic JSON opens its first level', async () => {
    const h = harness()
    try {
        const raw = '```json\n' + JSON.stringify({ version: 1, summary: '真实执行结果', items: [] }) + '\n```'
        await h.reply(
            snapshot(
                [message('final', 1, raw), message('other', 2, '{"summary":"ordinary JSON"}')],
                'succeeded',
                'closed',
                { text: '真实执行结果' }
            )
        )
        assert.equal(h.$('.public-message').textContent, '真实执行结果')
        assert.equal(jsonBranch(h, '').open, false)
        assert.equal(jsonValue(h, '/version').textContent, '1')
        assert.equal(jsonValue(h, '/summary').textContent, '"真实执行结果"')
        assert.equal(jsonBranch(h, '/items').querySelector('summary').textContent, '"items": [] · 0 项')
        assert.equal(h.$('.final-summary').hidden, true)
        assert.equal(h.$('[data-record-id="other"] .public-message').hidden, true)
        assert.equal(jsonBranch(h, '', '[data-record-id="other"]').open, true)
        assert.equal(h.$('[data-record-id="other"] .raw-result-title').textContent, 'JSON 结果')
    } finally {
        h.dom.window.close()
    }
})

test('JSON branches retain nodes, expansion and focus on updates; exact copy and deep search still work', async () => {
    const h = harness()
    try {
        const invalidEnvelope = {
            version: 1,
            summary: 'Do not treat this as a valid result',
            items: ['one.js', 'two.json'].map((path) => ({
                type: 'file',
                id: 'report',
                title: path,
                summary: '',
                path
            }))
        }
        const raw = '```json\n' + JSON.stringify(invalidEnvelope) + '\n```'
        await h.reply(snapshot([message('json', 1, raw)]))
        const root = jsonBranch(h, '')
        const items = jsonBranch(h, '/items')
        const first = jsonBranch(h, '/items/0')
        const value = jsonValue(h, '/items/0/path').firstChild
        assert.equal(root.open, true)
        assert.equal(items.open, false)
        assert.equal(first.open, false)
        assert.equal(h.$('.public-message').hidden, true)
        items.open = first.open = true
        let copied
        h.w.document.execCommand = () => {
            copied = h.w.document.activeElement.value
            return true
        }
        h.$('.raw-result button').click()
        await new Promise((resolve) => setImmediate(resolve))
        assert.equal(copied, raw)
        first.querySelector('summary').focus()
        h.$('.json-tree').scrollTop = 64
        const updated = { ...invalidEnvelope, extra: '<img src=x onerror=alert(1)>中文' }
        await h.poll()
        await h.reply(
            snapshot([message('json', 2, JSON.stringify(updated))], 'succeeded', 'closed', {
                text: JSON.stringify(updated)
            })
        )
        assert.equal(jsonBranch(h, '/items'), items)
        assert.equal(jsonBranch(h, '/items/0'), first)
        assert.equal(items.open, true)
        assert.equal(first.open, true)
        assert.equal(jsonValue(h, '/items/0/path').firstChild, value)
        assert.equal(h.w.document.activeElement, first.querySelector('summary'))
        assert.equal(h.$('.json-tree').scrollTop, 64)
        assert.equal(jsonValue(h, '/extra').textContent, JSON.stringify(updated.extra))
        assert.equal(h.$('.json-tree img'), null)
        assert.equal(h.$('.final-summary').hidden, true)
        root.open = items.open = false
        h.$('.header-actions button').click()
        const input = h.$('input[type="search"]')
        input.value = 'two.json'
        input.dispatchEvent(new h.w.Event('input'))
        assert.equal(root.open, true)
        assert.equal(items.open, true)
        assert.equal(jsonBranch(h, '/items/1').open, true)
        assert.match(h.$('.search-count').textContent, /2/)
    } finally {
        h.dom.window.close()
    }
})

test('historical arrays expose indexed tree nodes while malformed JSON remains readable text', async () => {
    const h = harness()
    try {
        await h.reply(
            snapshot([message('partial', 1, '{"incomplete":')], 'succeeded', 'closed', {
                text: '[{"value":"中文","ok":true,"empty":null}]'
            })
        )
        assert.equal(h.$('.public-message').textContent, '{"incomplete":')
        assert.equal(jsonBranch(h, '', '.final-summary').open, true)
        assert.equal(jsonBranch(h, '/0', '.final-summary').open, false)
        assert.equal(h.$('.final-summary .public-message').hidden, true)
        assert.equal(jsonBranch(h, '/0', '.final-summary').querySelector('summary').textContent, '[0]: {…} · 3 个字段')
        assert.equal(jsonValue(h, '/0/value', '.final-summary').textContent, '"中文"')
        assert.equal(jsonValue(h, '/0/ok', '.final-summary').dataset.jsonKind, 'boolean')
        assert.equal(jsonValue(h, '/0/empty', '.final-summary').textContent, 'null')
    } finally {
        h.dom.window.close()
    }
})

test('JSON tree arrow navigation stays within visible nodes and selection survives updates', async () => {
    const h = harness()
    try {
        await h.reply(
            snapshot([
                message('tree', 1, '{"group":{"value":"中文","count":1},"end":true}'),
                message('next', 2, 'next')
            ])
        )
        const key = (value) =>
            h.w.document.activeElement.dispatchEvent(new h.w.KeyboardEvent('keydown', { key: value, bubbles: true }))
        const group = jsonBranch(h, '/group')
        const toggle = group.querySelector('summary')
        const leaf = jsonValue(h, '/group/value').parentElement
        const rootToggle = jsonBranch(h, '').querySelector('summary')
        rootToggle.focus()
        key('ArrowDown')
        assert.equal(h.w.document.activeElement, toggle)
        key('ArrowDown')
        assert.equal(h.w.document.activeElement, jsonValue(h, '/end').parentElement)
        key('ArrowUp')
        key('ArrowRight')
        assert.equal(group.open, true)
        key('ArrowRight')
        assert.equal(h.w.document.activeElement, leaf)
        key('ArrowLeft')
        assert.equal(h.w.document.activeElement, toggle)
        key('ArrowLeft')
        assert.equal(group.open, false)
        key('ArrowLeft')
        assert.equal(h.w.document.activeElement, rootToggle)
        group.open = true
        const text = jsonValue(h, '/group/value').firstChild
        const range = h.w.document.createRange()
        range.setStart(text, 1)
        range.setEnd(text, 3)
        h.w.getSelection().removeAllRanges()
        h.w.getSelection().addRange(range)
        h.w.document.dispatchEvent(new h.w.Event('selectionchange'))
        await h.poll()
        await h.reply(
            snapshot(
                [{ ...message('tree', 3, '{"group":{"value":"中文更新","count":2},"end":true}'), firstSeq: 1 }],
                'succeeded',
                'closed'
            )
        )
        assert.equal(h.w.getSelection().toString(), '中文')
        assert.equal(text.textContent, '"中文"')
        h.w.getSelection().removeAllRanges()
        h.w.document.dispatchEvent(new h.w.Event('selectionchange'))
        assert.equal(jsonValue(h, '/group/value').firstChild, text)
        assert.equal(text.textContent, '"中文更新"')
        assert.equal(group.open, true)
    } finally {
        h.dom.window.close()
    }
})
