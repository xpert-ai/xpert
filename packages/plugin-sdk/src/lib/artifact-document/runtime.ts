import { artifactDocumentHtml } from './protocol'
import { renderArtifactDocumentDependencies, type ArtifactDocumentDependencyAsset } from './dependencies'
import { artifactDocumentCsp, type ArtifactDocumentNetworkPolicy } from './network'

export const ARTIFACT_DOCUMENT_CSP = artifactDocumentCsp()

/** Host-owned prefix precedes all authored markup, including malformed/duplicate heads. */
export function renderArtifactDocument(
  html: string,
  sessionId: string,
  dependencies: ArtifactDocumentDependencyAsset[] = [],
  networkPolicy?: ArtifactDocumentNetworkPolicy
): string {
  artifactDocumentHtml.parse(html)
  if (!/^[a-f0-9]{32}$/.test(sessionId)) throw new Error('Invalid Artifact document session ID')
  return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${artifactDocumentCsp(networkPolicy)}"><script>${ARTIFACT_DOCUMENT_RUNTIME.replace('__XPERT_DOCUMENT_SESSION__', sessionId)}</script>${renderArtifactDocumentDependencies(dependencies)}${html}`
}

const ARTIFACT_DOCUMENT_RUNTIME = String.raw`
;(() => {
  'use strict'
  const SESSION_ID = '__XPERT_DOCUMENT_SESSION__'
  const CHANNEL = 'xpert.artifact-document',
    VERSION = 1,
    pending = new Map(),
    listeners = new Map(),
    lastControls = new Map(),
    latest = new Map()
  let port,
    context,
    sequence = 0,
    resolveReady
  const ready = new Promise((resolve) => (resolveReady = resolve))
  const emit = (id, dataset) => {
    for (const fn of listeners.get(id) || [])
      try {
        fn(dataset)
      } catch (e) {
        console.error(e)
      }
  }
  const fail = (code) => Object.assign(new Error(code), { code })
  const query = async (bindingId, controls = {}) => {
    await ready
    if (!context.bindingIds.includes(bindingId)) {
      port.postMessage({ type: 'diagnostic', code: 'DOCUMENT_BINDING_DENIED' })
      throw fail('DOCUMENT_BINDING_DENIED')
    }
    const requestId = 'q' + ++sequence,
      values = { ...context.defaults, ...controls }
    lastControls.set(bindingId, values)
    latest.set(bindingId, requestId)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId)
        reject(fail('DOCUMENT_QUERY_TIMEOUT'))
      }, 45000)
      pending.set(requestId, { resolve, reject, timer, bindingId })
      port.postMessage({ type: 'query', requestId, bindingId, controls: values })
    })
  }
  const subscribe = (id, fn) => {
    if (typeof fn !== 'function') throw fail('DOCUMENT_INVALID_LISTENER')
    const set = listeners.get(id) || new Set()
    set.add(fn)
    listeners.set(id, set)
    return () => set.delete(fn)
  }
  const refresh = async (id) => query(id, lastControls.get(id) || {})
  const bindSelect = (element, config) => {
    if (
      !element ||
      element.tagName !== 'SELECT' ||
      !config ||
      typeof config.bindingId !== 'string' ||
      typeof config.controlId !== 'string' ||
      typeof config.fieldId !== 'string'
    )
      throw fail('DOCUMENT_INVALID_SELECT')
    const allValue = config.allValue === undefined ? null : config.allValue,
      known = new Set(),
      append = (value, label) => {
        const key = JSON.stringify(value)
        if (known.has(key)) return
        known.add(key)
        const option = document.createElement('option')
        option.value = key
        option.textContent = label
        element.append(option)
      }
    element.replaceChildren()
    append(allValue, config.allLabel || 'All')
    const update = (dataset) => {
      const selected = (lastControls.get(config.bindingId) || context.defaults)[config.controlId]
      for (const row of dataset.rows || []) {
        const value = row[config.fieldId]
        if (value !== null && ['string', 'number', 'boolean'].includes(typeof value)) append(value, String(value))
      }
      const key = JSON.stringify(selected === undefined ? allValue : selected)
      if (known.has(key)) element.value = key
    }
    const unsubscribe = subscribe(config.bindingId, update),
      change = () =>
        ready
          .then(() =>
            query(config.bindingId, {
              ...(lastControls.get(config.bindingId) || context.defaults),
              [config.controlId]: JSON.parse(element.value)
            })
          )
          .catch((error) =>
            element.dispatchEvent(new CustomEvent('xpert-query-error', { detail: { code: error.code }, bubbles: true }))
          )
    element.addEventListener('change', change)
    return () => {
      unsubscribe()
      element.removeEventListener('change', change)
    }
  }
  Object.defineProperty(window, 'xpertLiveArtifact', {
    value: Object.freeze({ ready: () => ready, query, subscribe, refresh, bindSelect }),
    writable: false,
    configurable: false
  })
  window.addEventListener('message', (event) => {
    const data = event.data
    if (
      port ||
      event.source !== parent ||
      !data ||
      data.channel !== CHANNEL ||
      data.version !== VERSION ||
      data.type !== 'init' ||
      data.sessionId !== SESSION_ID ||
      !event.ports[0]
    )
      return
    port = event.ports[0]
    context = data.context
    document.documentElement.dataset.theme = context.theme
    document.documentElement.style.colorScheme = context.theme
    port.onmessage = (event) => {
      const data = event.data
      if (data.type === 'refresh') {
        for (const id of new Set([...listeners.keys(), ...lastControls.keys()])) refresh(id).catch(console.error)
        return
      }
      if (data.type !== 'result') return
      const entry = pending.get(data.requestId)
      if (!entry) return
      pending.delete(data.requestId)
      clearTimeout(entry.timer)
      if (latest.get(entry.bindingId) !== data.requestId) {
        entry.reject(fail('DOCUMENT_QUERY_SUPERSEDED'))
        return
      }
      if (data.ok) {
        emit(entry.bindingId, data.dataset)
        entry.resolve(data.dataset)
      } else entry.reject(fail(data.code || 'DOCUMENT_QUERY_FAILED'))
    }
    port.start()
    resolveReady(context)
  })
  parent.postMessage({ channel: CHANNEL, version: VERSION, type: 'ready', sessionId: SESSION_ID }, '*')
})()
`
