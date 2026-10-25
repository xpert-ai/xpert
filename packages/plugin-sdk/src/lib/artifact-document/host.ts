// Invariants: a frame WindowProxy survives navigation, so source checks alone
// cannot identify a document generation. Each mount owns one handshake nonce,
// one MessagePort and a snapshot of the declared binding IDs.
import { z } from 'zod/v3'
import {
  ARTIFACT_DOCUMENT_CHANNEL,
  ARTIFACT_DOCUMENT_VERSION,
  artifactDocumentContext,
  artifactDocumentQuery,
  type ArtifactDocumentContext,
  type ArtifactDocumentQuery
} from './protocol'
import { renderArtifactDocument } from './runtime'
import type { ArtifactDocumentDependencyAsset } from './dependencies'
import type { ArtifactDocumentNetworkPolicy } from './network'

const readySchema = z
  .object({
    channel: z.literal(ARTIFACT_DOCUMENT_CHANNEL),
    version: z.literal(ARTIFACT_DOCUMENT_VERSION),
    type: z.literal('ready'),
    sessionId: z.string().regex(/^[a-f0-9]{32}$/)
  })
  .strict()
const diagnosticSchema = z
  .object({ type: z.literal('diagnostic'), code: z.literal('DOCUMENT_BINDING_DENIED') })
  .strict()

/** Trusted integration callbacks. T is the plugin's cloneable result shape, independent of any chart library. */
export interface ArtifactDocumentHostOptions<T> {
  /** Complete untrusted HTML; scripts run only inside the isolated frame. */
  html: string
  /** Exact packaged bytes pinned to this Artifact version, never URLs or library names from the document. */
  dependencies?: ArtifactDocumentDependencyAsset[]
  /** Optional trusted HTTPS resource allowlist. Omit to keep all external resources blocked. */
  networkPolicy?: ArtifactDocumentNetworkPolicy
  /** Public binding IDs and presentation defaults for this document generation. */
  context: ArtifactDocumentContext
  /** Resolve against saved Bindings on the server with the current user's access; never execute a query definition from HTML. */
  query(input: ArtifactDocumentQuery): Promise<T>
  /** Latest result for a Binding, suitable for host-owned freshness/partial-result indicators. */
  onResult?(result: T): void
  /** Stable protocol/query error code; private backend error details are never sent into the document. */
  onError?(code: string): void
  /** Tracks all pending host queries, including those superseded by newer filter values. */
  onBusy?(busy: boolean): void
}

/** Lifecycle handle for one mount; dispose before replacing the document or its trusted query scope. */
export interface ArtifactDocumentHost {
  /** Requeries subscribed/previously queried bindings using their last controls. */
  refresh(): void
  /** Closes the query channel and discards late results; backend cancellation remains the caller's responsibility. */
  dispose(): void
}

/** Dedicated query bridge. Requires a dedicated host document with installArtifactDocumentFramePolicy installed. */
export function mountArtifactDocument<T>(
  frame: HTMLIFrameElement,
  options: ArtifactDocumentHostOptions<T>
): ArtifactDocumentHost {
  if (!frame.ownerDocument.querySelector('meta[data-xpert-document-policy]')) {
    throw new Error('Install the Artifact document frame policy before mounting a document')
  }
  const context = artifactDocumentContext.parse(options.context)
  const sessionId = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')
  // Validate/render before allocating a channel or installing listeners.
  const source = renderArtifactDocument(options.html, sessionId, options.dependencies, options.networkPolicy)
  const channel = new MessageChannel()
  const bindingIds = new Set(context.bindingIds)
  const requestIds = new Set<string>()
  const activeIds = new Set<string>()
  const latest = new Map<string, string>()
  const hostWindow = frame.ownerDocument.defaultView!
  let connected = false,
    disposed = false,
    requests = 0,
    started = Date.now()
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.referrerPolicy = 'no-referrer'

  // Host UI observers cannot leave query accounting stuck or alter protocol completion.
  const observe = <V>(callback: ((value: V) => void) | undefined, value: V) => {
    try {
      callback?.(value)
    } catch {
      /* The query channel must survive a failing UI observer. */
    }
  }
  const post = (message: object) => {
    if (!disposed) channel.port1.postMessage(message)
  }
  const reject = (requestId: string, code: string) => {
    post({ type: 'result', requestId, ok: false, code })
    observe(options.onError, code)
  }
  channel.port1.onmessage = async (event: MessageEvent<unknown>) => {
    if (disposed) return
    const diagnostic = diagnosticSchema.safeParse(event.data)
    if (diagnostic.success) {
      observe(options.onError, diagnostic.data.code)
      return
    }
    const parsed = artifactDocumentQuery.safeParse(event.data)
    if (!parsed.success) {
      observe(options.onError, 'DOCUMENT_INVALID_REQUEST')
      return
    }
    const input: ArtifactDocumentQuery = {
      type: parsed.data.type,
      requestId: parsed.data.requestId,
      bindingId: parsed.data.bindingId,
      controls: parsed.data.controls
    }
    if (!bindingIds.has(input.bindingId)) {
      reject(input.requestId, 'DOCUMENT_BINDING_DENIED')
      return
    }
    if (Date.now() - started >= 60000) {
      requests = 0
      started = Date.now()
      requestIds.clear()
    }
    // Keep in-flight IDs protected even after the one-minute replay/rate window rolls over.
    if (activeIds.has(input.requestId) || requestIds.has(input.requestId)) {
      reject(input.requestId, 'DOCUMENT_REQUEST_REPLAY')
      return
    }
    if (activeIds.size >= 8 || ++requests > 60) {
      reject(input.requestId, 'DOCUMENT_QUERY_LIMIT')
      return
    }
    requestIds.add(input.requestId)
    activeIds.add(input.requestId)
    latest.set(input.bindingId, input.requestId)
    observe(options.onBusy, true)
    try {
      const dataset = await options.query(input)
      if (!disposed) {
        post({ type: 'result', requestId: input.requestId, ok: true, dataset })
        if (latest.get(input.bindingId) === input.requestId) observe(options.onResult, dataset)
      }
    } catch {
      if (!disposed) {
        post({ type: 'result', requestId: input.requestId, ok: false, code: 'DOCUMENT_QUERY_FAILED' })
        if (latest.get(input.bindingId) === input.requestId) observe(options.onError, 'DOCUMENT_QUERY_FAILED')
      }
    } finally {
      activeIds.delete(input.requestId)
      if (!disposed) observe(options.onBusy, activeIds.size > 0)
    }
  }
  const ready = (event: MessageEvent<unknown>) => {
    if (disposed || connected || event.source !== frame.contentWindow) return
    const parsed = readySchema.safeParse(event.data)
    if (!parsed.success || parsed.data.sessionId !== sessionId) return
    connected = true
    frame.contentWindow?.postMessage(
      {
        channel: ARTIFACT_DOCUMENT_CHANNEL,
        version: ARTIFACT_DOCUMENT_VERSION,
        type: 'init',
        sessionId,
        context
      },
      '*',
      [channel.port2]
    )
  }
  hostWindow.addEventListener('message', ready)
  channel.port1.start()
  frame.srcdoc = source
  return {
    refresh() {
      post({ type: 'refresh' })
    },
    dispose() {
      if (disposed) return
      disposed = true
      hostWindow.removeEventListener('message', ready)
      channel.port1.close()
      channel.port2.close()
      observe(options.onBusy, false)
    }
  }
}

/** Installs a document-wide policy once. Use a dedicated host: all URL-based child frames are denied; srcdoc works. */
export function installArtifactDocumentFramePolicy(hostDocument: Document) {
  if (hostDocument.querySelector('meta[data-xpert-document-policy]')) return
  const meta = hostDocument.createElement('meta')
  meta.httpEquiv = 'Content-Security-Policy'
  meta.content = "frame-src 'none'"
  meta.dataset['xpertDocumentPolicy'] = '1'
  hostDocument.head.prepend(meta)
}
