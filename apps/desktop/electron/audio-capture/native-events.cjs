const { AUDIO_CAPTURE_TRACKS: tracks, AUDIO_CAPTURE_LIMITS: limits } = require('@xpert-ai/desktop-protocol')
function invalid() {
  throw new Error('audio_conversion_failed')
}
function parseNativeEvent(event) {
  if (!event || typeof event !== 'object') invalid()
  if (event.type === 'started' || event.type === 'stopped') return { type: event.type }
  if (event.type === 'error')
    return {
      type: 'error',
      code: ['audio_permission_denied', 'audio_conversion_failed'].includes(event.code) ? event.code : 'device_lost'
    }
  if (event.type === 'level') {
    if (!tracks.includes(event.track) || !Number.isFinite(event.level)) invalid()
    return { type: 'level', track: event.track, level: Math.max(0, Math.min(1, event.level)) }
  }
  if (
    event.type !== 'chunk' ||
    !tracks.includes(event.track) ||
    !Number.isInteger(event.sequence) ||
    event.sequence < 0 ||
    event.sequence >= 5000 ||
    !Number.isFinite(event.startMs) ||
    !Number.isFinite(event.endMs) ||
    event.startMs < 0 ||
    event.endMs <= event.startMs ||
    event.endMs - event.startMs > limits.chunkMs ||
    event.endMs > limits.durationMs ||
    typeof event.wav !== 'string' ||
    event.wav.length > 400000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(event.wav)
  )
    invalid()
  const bytes = Buffer.from(event.wav, 'base64')
  if (
    bytes.length < 46 ||
    bytes.length > limits.chunkBytes ||
    bytes.length % 2 ||
    bytes.toString('ascii', 0, 4) !== 'RIFF' ||
    bytes.toString('ascii', 8, 16) !== 'WAVEfmt ' ||
    bytes.readUInt32LE(4) !== bytes.length - 8 ||
    bytes.readUInt32LE(16) !== 16 ||
    bytes.readUInt16LE(20) !== 1 ||
    bytes.readUInt16LE(22) !== 1 ||
    bytes.readUInt32LE(24) !== 24000 ||
    bytes.readUInt32LE(28) !== 48000 ||
    bytes.readUInt16LE(32) !== 2 ||
    bytes.readUInt16LE(34) !== 16 ||
    bytes.toString('ascii', 36, 40) !== 'data' ||
    bytes.readUInt32LE(40) !== bytes.length - 44 ||
    Math.abs((bytes.length - 44) / 48 - (event.endMs - event.startMs)) > 1
  )
    invalid()
  return {
    type: 'chunk',
    track: event.track,
    sequence: event.sequence,
    startMs: event.startMs,
    endMs: event.endMs,
    wav: event.wav
  }
}
module.exports = { parseNativeEvent }
