// Audio capture owns devices and delivery; callers own the meaning of their context and callbacks.
const AUDIO_CAPTURE_COMMANDS = Object.freeze([
  'desktop.audio.capture.start',
  'desktop.audio.capture.stop',
  'desktop.audio.capture.state',
  'desktop.audio.capture.retry'
])
const AUDIO_CAPTURE_TRACKS = Object.freeze(['microphone', 'system'])
const AUDIO_CAPTURE_LIMITS = Object.freeze({
  durationMs: 14400000,
  contextBytes: 8192,
  chunkMs: 6000,
  chunkBytes: 300000
})
const id = (value) => typeof value === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
const key = (value) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,200}$/.test(value)
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const only = (value, keys) => object(value) && Object.keys(value).every((key) => keys.includes(key))
function json(value, depth = 0) {
  if (depth > 10) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every((item) => json(item, depth + 1))
  return (
    object(value) &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Object.values(value).every((item) => json(item, depth + 1))
  )
}
function invalid() {
  throw new Error('invalid_input')
}
function isAudioCaptureCommand(value) {
  return AUDIO_CAPTURE_COMMANDS.includes(value)
}
function parseAudioCaptureDelivery(value) {
  if (
    !only(value, ['eventAction', 'chunkAction', 'context']) ||
    !key(value.eventAction) ||
    !key(value.chunkAction) ||
    value.eventAction === value.chunkAction
  )
    invalid()
  if (
    value.context !== undefined &&
    (!json(value.context) ||
      new TextEncoder().encode(JSON.stringify(value.context)).length > AUDIO_CAPTURE_LIMITS.contextBytes)
  )
    invalid()
  return {
    eventAction: value.eventAction,
    chunkAction: value.chunkAction,
    ...(value.context !== undefined ? { context: JSON.parse(JSON.stringify(value.context)) } : {})
  }
}
function parseAudioCapturePayload(commandKey, payload) {
  if (!isAudioCaptureCommand(commandKey)) throw new Error('unsupported')
  if (commandKey === 'desktop.audio.capture.start') {
    if (!only(payload, ['delivery'])) invalid()
    return { delivery: parseAudioCaptureDelivery(payload.delivery) }
  }
  if (!only(payload, ['captureId']) || (payload.captureId !== undefined && !id(payload.captureId))) invalid()
  if (commandKey !== 'desktop.audio.capture.state' && !payload.captureId) invalid()
  return payload.captureId ? { captureId: payload.captureId } : {}
}
module.exports = {
  AUDIO_CAPTURE_COMMANDS,
  AUDIO_CAPTURE_TRACKS,
  AUDIO_CAPTURE_LIMITS,
  isAudioCaptureCommand,
  parseAudioCaptureDelivery,
  parseAudioCapturePayload
}
