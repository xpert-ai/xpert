import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom/package.json'))('jsdom')
const bundle = await build({
    entryPoints: [fileURLToPath(new URL('../src/main.ts', import.meta.url))],
    bundle: true,
    write: false,
    metafile: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2020'
})
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test('uses the public result entry without pulling server SDK modules into the browser', () => {
    const inputs = Object.keys(bundle.metafile.inputs).map((path) => path.replaceAll('\\', '/'))
    assert.ok(inputs.some((path) => path.endsWith('/plugin-sdk/src/agent-results.ts')))
    const sdkInputs = inputs.filter((path) => path.includes('/plugin-sdk/src/'))
    assert.equal(sdkInputs.length, 2)
    assert.ok(sdkInputs.every((path) => path.endsWith('/src/agent-results.ts') || path.endsWith('/runtime/results.ts')))
    assert.ok(!inputs.some((path) => path.includes('/@nestjs/') || path.includes('/@langchain/')))
})

function fixture(t) {
    const dom = new JSDOM('<div id="root"></div>', { url: 'https://host.example/results', runScripts: 'outside-only' })
    t.after(() => dom.window.close())
    const w = dom.window,
        sent = [],
        downloads = []
    w.crypto.randomUUID = randomUUID
    w.postMessage = (message) => sent.push(message)
    w.HTMLElement.prototype.scrollIntoView = () => {}
    w.HTMLAnchorElement.prototype.click = function () {
        downloads.push(this.href)
    }
    w.eval(bundle.outputFiles[0].text)
    const send = (data) =>
        w.dispatchEvent(
            new w.MessageEvent('message', {
                source: w,
                data: { channel: 'xpertai.remote_component', protocolVersion: 1, instanceId: 'view', ...data }
            })
        )
    const init = (selectionId) => send({ type: 'init', locale: 'zh-Hans', initialQuery: { selectionId } })
    const reply = (request, data) => send({ type: 'data', requestId: request.requestId, data })
    const item = (result) => ({ item: { id: 'task', status: 'succeeded', selectedItemId: null, result } })
    return { w, sent, downloads, init, reply, item, send }
}

test('renders findings, changes, tests and file declarations as text without exporting them', async (t) => {
    const f = fixture(t)
    f.init('task')
    f.reply(
        f.sent.at(-1),
        f.item({
            text: '完成',
            items: [
                { type: 'analysis', id: 'review', title: '<img src=x onerror=alert(1)>', summary: '发现' },
                {
                    type: 'changes',
                    id: 'changes',
                    title: '变更',
                    summary: '修改',
                    files: [{ path: 'main.py', change: 'modified' }]
                },
                { type: 'tests', id: 'tests', title: '测试', summary: '尚未运行', status: 'skipped' },
                { type: 'file', id: 'report', title: '报告', summary: '文件声明', path: 'report.txt' }
            ],
            export: { status: 'not_requested' }
        })
    )
    await tick()
    assert.match(f.w.document.body.textContent, /main.py/)
    assert.match(f.w.document.body.textContent, /未运行/)
    assert.match(f.w.document.body.textContent, /report.txt/)
    assert.equal(f.w.document.querySelector('img'), null)
    assert.equal(f.w.document.querySelector('button'), null)
    assert.equal(f.sent.filter((message) => message.type === 'requestFileAccess').length, 0)
})

test('preserves task output and makes a separate error visible when export failed', async (t) => {
    const f = fixture(t)
    f.init('task')
    f.reply(f.sent.at(-1), f.item({ text: '测试已经通过', export: { status: 'failed', error: 'collection failed' } }))
    await tick()
    assert.match(f.w.document.body.textContent, /测试已经通过/)
    assert.match(f.w.document.body.textContent, /文件导出未完成/)
})

test('ignores stale results after navigating to a different card', async (t) => {
    const f = fixture(t)
    f.init('first')
    const first = f.sent.at(-1)
    f.init('second')
    const second = f.sent.at(-1)
    f.reply(second, f.item({ text: 'New result' }))
    await tick()
    f.reply(first, f.item({ text: 'Stale result' }))
    await tick()
    assert.match(f.w.document.body.textContent, /New result/)
    assert.doesNotMatch(f.w.document.body.textContent, /Stale result/)
})

test('requests an authorized grant on click and blocks executable download URLs', async (t) => {
    const f = fixture(t)
    f.init('task')
    f.reply(
        f.sent.at(-1),
        f.item({ text: 'Done', artifacts: [{ id: 'file', name: 'result.txt', versionId: 'version' }] })
    )
    await tick()
    const button = f.w.document.querySelector('button')
    button.click()
    const request = f.sent.at(-1)
    assert.equal(request.type, 'requestFileAccess')
    assert.equal(request.targetId, 'task')
    assert.equal(request.fileKey, 'file')
    assert.equal(request.purpose, 'download')
    f.reply(request, { url: 'javascript:alert(1)', fileName: 'result.txt' })
    await tick()
    assert.deepEqual(f.downloads, [])
    assert.match(f.w.document.querySelector('[role="alert"]').textContent, /Invalid download URL/)
    assert.equal(button.disabled, false)
    button.click()
    f.reply(f.sent.at(-1), { url: 'https://host.example/download/grant', fileName: 'result.txt' })
    await tick()
    assert.deepEqual(f.downloads, ['https://host.example/download/grant'])
})

test('explains why a legacy artifact cannot be downloaded instead of selecting a newer version', async (t) => {
    const f = fixture(t)
    f.init('task')
    f.reply(f.sent.at(-1), f.item({ text: 'Historical result', artifacts: [{ id: 'file', name: 'result.txt' }] }))
    await tick()
    assert.equal(f.w.document.querySelector('button').disabled, true)
    assert.match(f.w.document.body.textContent, /未记录版本/)
    assert.match(f.w.document.body.textContent, /Historical result/)
    assert.equal(f.sent.filter((message) => message.type === 'requestFileAccess').length, 0)
})
