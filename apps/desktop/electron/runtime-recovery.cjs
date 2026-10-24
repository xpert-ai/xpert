// Retry only explicit pre-controller runtime rejections. Network failures and arbitrary POSTs are never replayed.
const runtimeCodes = new Set(['RUNTIME_DRAINING', 'RUNTIME_NOT_READY'])
async function runtimeFailure(response) {
  if (response.status !== 503) return null
  const body = await response
    .clone()
    .json()
    .catch(() => null)
  if (!runtimeCodes.has(body?.errorCode)) return null
  const header = response.headers.get('retry-after')
  const seconds =
    header === null
      ? 5
      : /^\d+$/.test(header.trim())
        ? Number(header)
        : Math.max(0, (Date.parse(header) - Date.now()) / 1000)
  return { errorCode: body.errorCode, retryAfterMs: Number.isFinite(seconds) ? Math.ceil(seconds * 1000) : 5000 }
}
async function runtimeRequest(
  send,
  {
    safe,
    assertCurrent,
    budget = { remaining: 2, deadline: Date.now() + 15_000 },
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  }
) {
  for (;;) {
    assertCurrent()
    const response = await send()
    assertCurrent()
    const runtime = await runtimeFailure(response)
    if (!safe || !runtime || budget.remaining <= 0 || Date.now() + runtime.retryAfterMs > budget.deadline)
      return { response, runtime }
    budget.remaining--
    await response.body?.cancel()
    await wait(Math.max(250, runtime.retryAfterMs))
    if (Date.now() > budget.deadline) return { response, runtime }
  }
}
module.exports = { runtimeFailure, runtimeRequest }
