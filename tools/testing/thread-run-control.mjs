// Acceptance tooling only: finite control operations, not a background budget service.
// A 202 pause acknowledgement is not a stopped worker; confirm the same run's public control view.
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

class ControlError extends Error {
  constructor(code) {
    super(code)
    this.code = code
  }
}

export function createThreadRunControlClient({ apiUrl, headers = {}, requestTimeoutMs = 10_000 }) {
  const base = new URL(apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`)
  if (
    !['http:', 'https:'].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    !base.pathname.endsWith('/api/')
  )
    throw new ControlError('CONTROL_INVALID_API_URL')
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs <= 0)
    throw new ControlError('CONTROL_INVALID_TIMEOUT')
  const path = (threadId, runId, action) => {
    if (!threadId || !runId) throw new ControlError('CONTROL_MISSING_TARGET')
    return `ai/threads/${encodeURIComponent(threadId)}/runs/${encodeURIComponent(runId)}/${action}`
  }
  const request = async (route, method = 'GET', body, timeoutMs = requestTimeoutMs) => {
    let response
    try {
      response = await fetch(new URL(route, base), {
        method,
        headers: { ...headers, 'content-type': 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(Math.min(timeoutMs, requestTimeoutMs)),
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
      if (!response.ok) throw new ControlError(`CONTROL_HTTP_${response.status}`)
      return response.status === 204 ? undefined : await response.json()
    } catch (error) {
      if (error instanceof ControlError) throw error
      throw new ControlError(error?.name === 'TimeoutError' ? 'CONTROL_REQUEST_TIMEOUT' : 'CONTROL_REQUEST_FAILED')
    }
  }
  return {
    pausePath: (threadId, runId) => new URL(path(threadId, runId, 'pause'), base).pathname,
    pause: (threadId, runId, timeoutMs) => request(path(threadId, runId, 'pause'), 'POST', undefined, timeoutMs),
    resume: (threadId, runId, pauseId) => request(path(threadId, runId, 'resume'), 'POST', { pauseId }),
    cancel: (threadId, runId) => request(path(threadId, runId, 'cancel'), 'POST'),
    view: (threadId, timeoutMs) =>
      request(`ai/threads/${encodeURIComponent(threadId)}/control-view`, 'GET', undefined, timeoutMs)
  }
}

export async function pauseRunAndConfirm({
  client,
  threadId,
  runId,
  journalPath,
  timeoutMs = 30_000,
  pollIntervalMs = 250
}) {
  if (
    !journalPath ||
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs <= 0 ||
    !Number.isSafeInteger(pollIntervalMs) ||
    pollIntervalMs <= 0
  )
    throw new ControlError('CONTROL_INVALID_MONITOR_OPTIONS')
  await mkdir(dirname(journalPath), { recursive: true })
  const record = (event, details = {}) =>
    appendFile(
      journalPath,
      `${JSON.stringify({ at: new Date().toISOString(), event, threadId, runId, ...details })}\n`,
      { mode: 0o600 }
    )
  const deadline = Date.now() + timeoutMs
  let lastState
  try {
    await record('pause_requested')
    const accepted = await client.pause(threadId, runId, timeoutMs)
    if (accepted?.executionId !== runId || !['pausing', 'paused'].includes(accepted.state))
      throw new ControlError('CONTROL_UNEXPECTED_ACKNOWLEDGEMENT')
    await record('pause_accepted')
    while (Date.now() < deadline) {
      const view = await client.view(threadId, Math.max(1, deadline - Date.now()))
      if (view?.threadId !== threadId || view?.runId !== runId) throw new ControlError('CONTROL_TARGET_CHANGED')
      lastState = view.state
      if (['paused', 'stopped', 'completed', 'failed'].includes(lastState)) {
        await record('pause_confirmed', { state: lastState })
        return view
      }
      await delay(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())))
    }
    throw new ControlError('CONTROL_PAUSE_UNCONFIRMED')
  } catch (error) {
    await record('control_failed', {
      code: error instanceof ControlError ? error.code : 'CONTROL_MONITOR_FAILED',
      ...(typeof lastState === 'string' ? { lastState } : {}),
      action: { method: 'POST', path: client.pausePath(threadId, runId) }
    })
    throw error
  }
}
