import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { startRemoteViewPreview } from './preview-host.mjs'

test('serves built assets and forwards bridge requests to the fixture', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'remote-view-preview-'))
  const componentRoot = join(workspaceRoot, 'component')
  await writeFile(join(workspaceRoot, 'package.json'), '{}')
  await mkdir(componentRoot)
  await writeFile(join(componentRoot, 'app.js'), 'window.__REMOTE_VIEW_TEST__ = true')
  await writeFile(join(componentRoot, 'app.css'), ':root { color: CanvasText; }')

  const preview = await startRemoteViewPreview(
    {
      title: 'Remote View Test',
      workspaceRoot,
      instanceId: 'remote-view-test',
      component: {
        root: componentRoot,
        runtime: 'react'
      },
      hostContext: {
        manifest: { key: 'remote-view-test' },
        locale: 'zh-Hans'
      },
      runtimeAssets: {
        reactUmd: 'window.React = {}',
        reactDomUmd: 'window.ReactDOM = {}'
      },
      renderers: {
        renderRemoteReactIframeHtml(options) {
          return `<!doctype html><html><style>${options.appCss}</style><script>${options.appScript}</script></html>`
        },
        renderRemoteModuleIframeHtml() {
          return ''
        },
        renderRemoteVueIframeHtml() {
          return ''
        }
      },
      state: { requestCount: 0 },
      async handleRequest(message, { state }) {
        state.requestCount += 1
        return {
          data: {
            type: message.type,
            requestCount: state.requestCount
          }
        }
      },
      logStartup: false,
      logErrors: false
    },
    { port: 0 }
  )

  context.after(async () => {
    await preview.close()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  const hostResponse = await fetch(preview.url)
  assert.equal(hostResponse.status, 200)
  assert.match(await hostResponse.text(), /<iframe id="remote-view"/)

  const frameResponse = await fetch(new URL('/frame', preview.url))
  assert.equal(frameResponse.status, 200)
  const frameHtml = await frameResponse.text()
  assert.match(frameHtml, /window\.__REMOTE_VIEW_TEST__/)
  assert.match(frameHtml, /remote-view-preview:error/)

  const bridgeResponse = await fetch(new URL('/__xpert/remote-view-preview/bridge', preview.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channel: 'xpertai.remote_component',
      protocolVersion: 1,
      instanceId: 'remote-view-test',
      type: 'requestData',
      requestId: '1',
      query: { page: 1 }
    })
  })
  assert.equal(bridgeResponse.status, 200)
  assert.deepEqual(await bridgeResponse.json(), {
    data: {
      type: 'requestData',
      requestCount: 1
    }
  })
  assert.equal(preview.state.requestCount, 1)

  const healthResponse = await fetch(new URL('/__xpert/remote-view-preview/health', preview.url))
  assert.deepEqual(await healthResponse.json(), {
    ok: true,
    title: 'Remote View Test',
    instanceId: 'remote-view-test',
    statePath: '/__xpert/remote-view-preview/state'
  })

  const stateResponse = await fetch(new URL('/__xpert/remote-view-preview/state', preview.url))
  assert.deepEqual(await stateResponse.json(), { requestCount: 1 })
})

test('rejects messages for another preview instance', async (context) => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'remote-view-preview-invalid-'))
  const componentRoot = join(workspaceRoot, 'component')
  await mkdir(componentRoot)
  await writeFile(join(componentRoot, 'app.js'), '')
  await writeFile(join(componentRoot, 'app.css'), '')

  const preview = await startRemoteViewPreview(
    {
      workspaceRoot,
      instanceId: 'expected-instance',
      component: { root: componentRoot, runtime: 'module' },
      renderers: {
        renderRemoteReactIframeHtml() {
          return ''
        },
        renderRemoteModuleIframeHtml() {
          return '<!doctype html>'
        },
        renderRemoteVueIframeHtml() {
          return ''
        }
      },
      exposeState: false,
      logStartup: false,
      logErrors: false
    },
    { port: 0 }
  )

  context.after(async () => {
    await preview.close()
    await rm(workspaceRoot, { recursive: true, force: true })
  })

  const response = await fetch(new URL('/__xpert/remote-view-preview/bridge', preview.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      channel: 'xpertai.remote_component',
      protocolVersion: 1,
      instanceId: 'wrong-instance',
      type: 'requestData',
      requestId: '1'
    })
  })
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), {
    message: 'Remote bridge instance id does not match the preview host.'
  })

  const stateResponse = await fetch(new URL('/__xpert/remote-view-preview/state', preview.url))
  assert.equal(stateResponse.status, 404)
})
