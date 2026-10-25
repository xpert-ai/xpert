import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom/package.json'))('jsdom')
const root = dirname(fileURLToPath(import.meta.url))
const tick = () => new Promise((resolve) => setImmediate(resolve))
const zipBytes = Uint8Array.from([80, 75, 3, 4, 0, 255, 128, 13, 10])

for (const name of ['agent-results', 'coding-execution']) {
    const bundle = await build({
        entryPoints: [join(root, name, 'src/main.ts')],
        bundle: true,
        write: false,
        format: 'iife',
        platform: 'browser',
        target: 'es2020',
        jsx: 'automatic',
        define: { 'process.env.NODE_ENV': '"production"' },
        alias: {
            react: dirname(require.resolve('react/package.json')),
            'react-dom': dirname(require.resolve('react-dom/package.json'))
        },
        loader: { '.svg': 'text' }
    })

    async function fixture(t) {
        const dom = new JSDOM('<div id="root"></div>', {
            url: 'https://host.example/view',
            runScripts: 'outside-only',
            pretendToBeVisual: true
        })
        t.after(() => dom.window.close())
        const w = dom.window,
            requests = [],
            downloads = [],
            blobs = new Map(),
            cleanup = [],
            revoked = []
        w.crypto.randomUUID = randomUUID
        w.HTMLElement.prototype.scrollIntoView = () => {}
        w.Range.prototype.getBoundingClientRect = () => ({ top: 0, bottom: 20 })
        w.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
        w.postMessage = (message) => requests.push(message)
        w.HTMLAnchorElement.prototype.click = function () {
            downloads.push({ href: this.href, fileName: this.download, target: this.target, rel: this.rel })
        }
        w.URL.createObjectURL = (blob) => {
            const url = `blob:null/${randomUUID()}`
            blobs.set(url, blob)
            return url
        }
        w.URL.revokeObjectURL = (url) => revoked.push(url)
        const setTimeout = w.setTimeout.bind(w)
        w.setTimeout = (fn, delay) => {
            if (delay === 60_000) {
                cleanup.push(fn)
                return 0
            }
            return setTimeout(fn, delay)
        }
        w.eval(bundle.outputFiles[0].text)
        const receive = (data) =>
            w.dispatchEvent(
                new w.MessageEvent('message', {
                    source: w,
                    data: {
                        channel: 'xpertai.remote_component',
                        protocolVersion: 1,
                        instanceId: 'test',
                        scopeRevision: 1,
                        ...data
                    }
                })
            )
        const init = (selectionId) => receive({ type: 'init', locale: 'en-US', initialQuery: { selectionId } })
        init('run')
        const result = { text: 'Done', artifacts: [{ id: 'file', name: 'artifact.zip', versionId: 'v1' }] }
        const item =
            name === 'agent-results'
                ? { id: 'run', status: 'succeeded', selectedItemId: null, result }
                : {
                      execution: {
                          id: 'run',
                          provider: 'codex',
                          status: 'succeeded',
                          result,
                          createdAt: '2026-10-25T00:00:00Z',
                          updatedAt: '2026-10-25T00:00:00Z'
                      },
                      activity: { items: [], state: 'closed', gaps: [], hasMore: false, nextCursor: 0 }
                  }
        receive({ type: 'data', requestId: requests.at(-1).requestId, data: { item } })
        await tick()
        const button = w.document.querySelector(name === 'agent-results' ? 'button' : '.artifacts button')
        assert.ok(button)
        button.click()
        const request = requests.at(-1)
        assert.equal(request.type, 'requestFileAccess')
        assert.equal(request.fileKey, 'file')
        assert.equal(request.targetId, 'run')
        assert.equal(request.purpose, 'download')
        const reply = async (url) => {
            receive({ type: 'fileAccessResult', requestId: request.requestId, result: { url, fileName: '项目.zip' } })
            await tick()
        }
        return { w, downloads, blobs, cleanup, revoked, reply, init, receive, request }
    }

    test(`${name}: downloads host-authorized data as a local attachment with identical bytes`, async (t) => {
        const f = await fixture(t)
        await f.reply(`data:application/zip;base64,${Buffer.from(zipBytes).toString('base64')}`)
        assert.equal(f.downloads.length, 1)
        const download = f.downloads[0],
            blob = f.blobs.get(download.href)
        assert.ok(blob)
        assert.equal(blob.type, 'application/octet-stream')
        assert.equal(download.fileName, '项目.zip')
        assert.equal(download.target, '')
        const bytes = await new Promise((resolve, reject) => {
            const reader = new f.w.FileReader()
            reader.onload = () => resolve(new Uint8Array(reader.result))
            reader.onerror = reject
            reader.readAsArrayBuffer(blob)
        })
        assert.deepEqual(bytes, zipBytes)
        assert.deepEqual(f.revoked, [])
        f.cleanup.forEach((release) => release())
        assert.deepEqual(f.revoked, [download.href])
        assert.equal(f.w.document.querySelectorAll('a[download]').length, 0)
    })

    test(`${name}: preserves the HTTP Web/desktop grant download path`, async (t) => {
        const f = await fixture(t)
        await f.reply('https://host.example/authorized-download')
        assert.deepEqual(f.downloads, [
            {
                href: 'https://host.example/authorized-download',
                fileName: '项目.zip',
                target: '_blank',
                rel: 'noopener noreferrer'
            }
        ])
        assert.equal(f.blobs.size, 0)
    })

    for (const url of [
        'javascript:alert(1)',
        'file:///etc/passwd',
        'data:text/html,<script>alert(1)</script>',
        'data:application/zip;base64,!',
        'data:application/zip;base64,A',
        'blob:https://host.example/parent'
    ]) {
        test(`${name}: rejects unsupported or malformed ${url.split(',')[0]} content`, async (t) => {
            const f = await fixture(t)
            await f.reply(url)
            assert.equal(f.downloads.length, 0)
            assert.equal(f.blobs.size, 0)
            assert.match(f.w.document.body.textContent, /Invalid download URL|Download failed/)
        })
    }

    test(`${name}: HTML artifacts are attachments, never data navigations`, async (t) => {
        const f = await fixture(t)
        await f.reply('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')
        assert.equal(f.downloads.length, 1)
        assert.equal(f.blobs.get(f.downloads[0].href).type, 'application/octet-stream')
        assert.equal(f.downloads[0].target, '')
    })

    test(`${name}: ignores a late download grant after changing selection`, async (t) => {
        const f = await fixture(t)
        f.init('other-run')
        await f.reply('data:application/zip;base64,UEsDBA==')
        assert.equal(f.downloads.length, 0)
        assert.equal(f.blobs.size, 0)
    })
}
