import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const CHANNEL = 'xpertai.remote_component'
const PROTOCOL_VERSION = 1
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 4409
const BRIDGE_PATH = '/__xpert/remote-view-preview/bridge'
const HEALTH_PATH = '/__xpert/remote-view-preview/health'
const STATE_PATH = '/__xpert/remote-view-preview/state'
const MAX_REQUEST_BYTES = 10 * 1024 * 1024

export function defineRemoteViewPreview(config) {
  return config
}

export async function startRemoteViewPreview(config, overrides = {}) {
  const normalized = normalizeConfig(config, overrides)
  const frameHtml = await renderFrameHtml(normalized)
  const hostHtml = renderHostHtml(normalized)
  const state = normalized.state

  const server = createServer((request, response) => {
    void handleHttpRequest({
      request,
      response,
      config: normalized,
      frameHtml,
      hostHtml,
      state
    }).catch((error) => {
      if (!response.headersSent) {
        sendJson(response, 500, { message: toErrorMessage(error) })
      } else {
        response.end()
      }
      if (normalized.logErrors) {
        console.error('[remote-view-preview] request failed', error)
      }
    })
  })

  await listen(server, normalized.port, normalized.host)
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Remote View Preview Host did not expose a TCP address.')
  }
  const url = `http://${formatHostForUrl(normalized.host)}:${address.port}/`
  if (normalized.logStartup) {
    console.log(`${normalized.title}: ${url}`)
  }

  return {
    url,
    host: normalized.host,
    port: address.port,
    state,
    server,
    close: () => closeServer(server)
  }
}

async function handleHttpRequest({ request, response, config, frameHtml, hostHtml, state }) {
  const requestUrl = new URL(request.url ?? '/', `http://${config.host}`)

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    sendHtml(response, hostHtml)
    return
  }
  if (request.method === 'GET' && requestUrl.pathname === '/frame') {
    sendHtml(response, frameHtml)
    return
  }
  if (request.method === 'GET' && requestUrl.pathname === HEALTH_PATH) {
    sendJson(response, 200, {
      ok: true,
      title: config.title,
      instanceId: config.instanceId,
      statePath: config.exposeState ? STATE_PATH : undefined
    })
    return
  }
  if (request.method === 'GET' && requestUrl.pathname === STATE_PATH && config.exposeState) {
    sendJson(response, 200, state)
    return
  }
  if (request.method === 'POST' && requestUrl.pathname === BRIDGE_PATH) {
    const message = await readJsonBody(request)
    validateBridgeMessage(message, config.instanceId)
    const context = {
      state,
      manifest: config.hostContext.manifest,
      payload: config.hostContext.payload,
      initialQuery: config.hostContext.initialQuery,
      locale: config.hostContext.locale
    }
    const result = message.requestId
      ? await config.handleRequest(message, context)
      : await config.handleEvent(message, context)
    sendJson(response, 200, isPlainObject(result) ? result : {})
    return
  }
  if (request.method === 'GET' && requestUrl.pathname === '/favicon.ico') {
    response.writeHead(204)
    response.end()
    return
  }

  sendJson(response, 404, { message: 'Not found.' })
}

async function renderFrameHtml(config) {
  const component = config.component
  const appScript = await readFile(resolve(component.root, component.script), 'utf8')
  const appCss = await readFile(resolve(component.root, component.css), 'utf8')
  const renderer = await loadRenderer(config)
  const sharedOptions = {
    title: component.title,
    lang: config.hostContext.locale,
    appCss: `${appCss}
html, body, #root {
  height: 100%;
  min-height: 0;
  overflow: hidden;
}`,
    appScript: `${remoteErrorForwarder()}
${appScript}`
  }

  if (component.runtime === 'react') {
    const reactUmd = await loadRuntimeAsset(config, 'react')
    const reactDomUmd = await loadRuntimeAsset(config, 'react-dom')
    return renderer.renderRemoteReactIframeHtml({
      ...sharedOptions,
      reactUmd,
      reactDomUmd
    })
  }
  if (component.runtime === 'vue') {
    return renderer.renderRemoteVueIframeHtml(sharedOptions)
  }
  return renderer.renderRemoteModuleIframeHtml(sharedOptions)
}

async function loadRenderer(config) {
  if (config.renderers) {
    return config.renderers
  }

  const modulePath = resolvePluginSdkModule(config)
  const require = createRequire(import.meta.url)
  const renderer = require(modulePath)
  const required = ['renderRemoteModuleIframeHtml', 'renderRemoteReactIframeHtml', 'renderRemoteVueIframeHtml']
  for (const exportName of required) {
    if (typeof renderer[exportName] !== 'function') {
      throw new Error(`Plugin SDK renderer '${exportName}' is unavailable in ${modulePath}.`)
    }
  }
  return renderer
}

function resolvePluginSdkModule(config) {
  if (config.pluginSdkModule) {
    return config.pluginSdkModule
  }

  const workspaceBuild = resolve(config.workspaceRoot, 'packages/plugin-sdk/dist/index.cjs.js')
  if (existsSync(workspaceBuild)) {
    return workspaceBuild
  }

  const requireFromWorkspace = createRequire(resolve(config.workspaceRoot, 'package.json'))
  try {
    return requireFromWorkspace.resolve('@xpert-ai/plugin-sdk')
  } catch {
    throw new Error(
      [
        'Unable to resolve @xpert-ai/plugin-sdk for the Remote View Preview Host.',
        'Build packages/plugin-sdk or set config.pluginSdkModule to the installed SDK entry.'
      ].join(' ')
    )
  }
}

async function loadRuntimeAsset(config, packageName) {
  const configuredText = packageName === 'react' ? config.runtimeAssets.reactUmd : config.runtimeAssets.reactDomUmd
  if (configuredText) {
    return configuredText
  }

  const configuredPath =
    packageName === 'react' ? config.runtimeAssets.reactUmdPath : config.runtimeAssets.reactDomUmdPath
  const relativePath =
    packageName === 'react' ? 'react/umd/react.production.min.js' : 'react-dom/umd/react-dom.production.min.js'
  const assetPath = configuredPath ?? resolve(config.workspaceRoot, 'node_modules', relativePath)
  if (!existsSync(assetPath)) {
    throw new Error(`Missing ${packageName} UMD runtime at ${assetPath}.`)
  }
  return readFile(assetPath, 'utf8')
}

function renderHostHtml(config) {
  const initMessage = {
    channel: CHANNEL,
    protocolVersion: PROTOCOL_VERSION,
    instanceId: config.instanceId,
    type: 'init',
    ...config.hostContext
  }

  return `<!doctype html>
<html lang="${escapeHtmlAttribute(config.hostContext.locale)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(config.title)}</title>
    <style>
      html, body { height: 100%; margin: 0; overflow: hidden; background: Canvas; color-scheme: light dark; }
      iframe { display: block; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="remote-view" title="${escapeHtmlAttribute(config.frameTitle)}"></iframe>
    <script>
      const channel = ${serializeForInlineScript(CHANNEL)}
      const protocolVersion = ${PROTOCOL_VERSION}
      const instanceId = ${serializeForInlineScript(config.instanceId)}
      const initMessage = ${serializeForInlineScript(initMessage)}
      const bridgePath = ${serializeForInlineScript(BRIDGE_PATH)}
      const frame = document.getElementById('remote-view')
      const targetOrigin = window.location.origin

      window.addEventListener('message', async (event) => {
        const message = event.data
        if (
          event.source !== frame.contentWindow ||
          event.origin !== targetOrigin ||
          !message ||
          message.channel !== channel ||
          message.protocolVersion !== protocolVersion
        ) {
          return
        }

        if (message.type === 'ready') {
          frame.contentWindow.postMessage(initMessage, targetOrigin)
          return
        }

        if (!message.requestId) {
          void forwardToHost(message)
          return
        }

        try {
          const body = await forwardToHost(message)
          frame.contentWindow.postMessage({
            channel,
            protocolVersion,
            instanceId,
            type: 'response',
            requestId: message.requestId,
            ...body
          }, targetOrigin)
        } catch (error) {
          frame.contentWindow.postMessage({
            channel,
            protocolVersion,
            instanceId,
            type: 'error',
            requestId: message.requestId,
            message: error instanceof Error ? error.message : String(error)
          }, targetOrigin)
        }
      })

      window.XpertRemoteViewPreview = Object.freeze({
        emitHostEvent(event) {
          frame.contentWindow.postMessage({
            channel,
            protocolVersion,
            instanceId,
            type: 'hostEvent',
            event
          }, targetOrigin)
        },
        reload() {
          frame.contentWindow.location.reload()
        }
      })

      async function forwardToHost(message) {
        const response = await fetch(bridgePath, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(serializeMessage(message))
        })
        const body = await response.json()
        if (!response.ok) {
          throw new Error(body.message || 'Remote View Preview Host request failed.')
        }
        return body
      }

      function serializeMessage(message) {
        const result = { ...message }
        const file = message.file
        if (file && file.buffer instanceof ArrayBuffer) {
          result.file = {
            ...file,
            bufferBase64: encodeBase64(new Uint8Array(file.buffer))
          }
          delete result.file.buffer
        }
        return result
      }

      function encodeBase64(bytes) {
        let binary = ''
        const chunkSize = 0x8000
        for (let offset = 0; offset < bytes.length; offset += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
        }
        return window.btoa(binary)
      }

      frame.src = '/frame'
    </script>
  </body>
</html>`
}

function normalizeConfig(config, overrides) {
  if (!isPlainObject(config)) {
    throw new Error('Remote View preview config must be an object.')
  }
  if (!isPlainObject(config.component) || typeof config.component.root !== 'string') {
    throw new Error('Remote View preview config.component.root is required.')
  }

  const workspaceRoot = resolve(overrides.workspaceRoot ?? config.workspaceRoot ?? process.cwd())
  const runtime = config.component.runtime ?? 'react'
  if (!['module', 'react', 'vue'].includes(runtime)) {
    throw new Error(`Unsupported Remote View runtime '${runtime}'.`)
  }

  const host = overrides.host ?? config.host ?? DEFAULT_HOST
  return {
    title: config.title ?? 'Xpert Remote View Preview',
    frameTitle: config.frameTitle ?? config.title ?? 'Xpert Remote View Preview',
    instanceId: config.instanceId ?? 'remote-view-preview',
    host,
    port: normalizePort(overrides.port ?? config.port ?? DEFAULT_PORT),
    workspaceRoot,
    pluginSdkModule: config.pluginSdkModule ? resolve(workspaceRoot, config.pluginSdkModule) : undefined,
    component: {
      root: resolve(workspaceRoot, config.component.root),
      runtime,
      title: config.component.title ?? config.title ?? 'Remote View Preview',
      script: config.component.script ?? 'app.js',
      css: config.component.css ?? 'app.css'
    },
    hostContext: {
      manifest: isPlainObject(config.hostContext?.manifest)
        ? config.hostContext.manifest
        : { key: 'remote-view-preview' },
      payload: isPlainObject(config.hostContext?.payload) ? config.hostContext.payload : {},
      initialQuery: isPlainObject(config.hostContext?.initialQuery)
        ? config.hostContext.initialQuery
        : { page: 1, pageSize: 50, parameters: {} },
      locale: config.hostContext?.locale ?? 'en-US',
      theme: config.hostContext?.theme ?? { mode: 'light', tokens: {} },
      debug: isPlainObject(config.hostContext?.debug) ? config.hostContext.debug : { enabled: false, production: true }
    },
    state: config.state ?? {},
    exposeState: config.exposeState ?? isLoopbackHost(host),
    handleRequest:
      typeof config.handleRequest === 'function'
        ? config.handleRequest
        : async () => {
            throw new Error('No preview response is configured for this Remote View request.')
          },
    handleEvent: typeof config.handleEvent === 'function' ? config.handleEvent : async () => ({}),
    renderers: config.renderers,
    runtimeAssets: isPlainObject(config.runtimeAssets) ? config.runtimeAssets : {},
    logStartup: overrides.logStartup ?? config.logStartup ?? true,
    logErrors: overrides.logErrors ?? config.logErrors ?? true
  }
}

function validateBridgeMessage(message, instanceId) {
  if (!isPlainObject(message)) {
    throw new Error('Remote bridge request must be a JSON object.')
  }
  if (message.channel !== CHANNEL || message.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error('Remote bridge channel or protocol version is invalid.')
  }
  if (message.instanceId !== instanceId) {
    throw new Error('Remote bridge instance id does not match the preview host.')
  }
  if (typeof message.type !== 'string' || !message.type) {
    throw new Error('Remote bridge message type is required.')
  }
}

async function readJsonBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_REQUEST_BYTES) {
      throw new Error(`Remote bridge request exceeds ${MAX_REQUEST_BYTES} bytes.`)
    }
    chunks.push(chunk)
  }
  if (!chunks.length) {
    return {}
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new Error('Remote bridge request body is not valid JSON.')
  }
}

function remoteErrorForwarder() {
  return `window.addEventListener('error', (event) => {
  if (event.error?.stack) {
    console.error('[remote-view-preview:error]', event.error.stack)
  }
})
window.addEventListener('unhandledrejection', (event) => {
  console.error('[remote-view-preview:unhandled-rejection]', event.reason)
})`
}

function normalizePort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`Invalid Remote View preview port '${value}'.`)
  }
  return port
}

function formatHostForUrl(host) {
  return host.includes(':') ? `[${host}]` : host
}

function listen(server, port, host) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolvePromise()
    })
  })
}

function closeServer(server) {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error) {
        reject(error)
      } else {
        resolvePromise()
      }
    })
  })
}

function sendHtml(response, html) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(html)
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  })
  response.end(body)
}

function serializeForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeHtmlAttribute(value) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

function toErrorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
