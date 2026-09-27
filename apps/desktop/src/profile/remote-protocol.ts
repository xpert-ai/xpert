export const PROFILE_CHANNEL = 'xpertai.remote_component'
export interface ProfileMessage {
  channel: typeof PROFILE_CHANNEL
  protocolVersion: 1
  type: string
  instanceId?: string
  requestId?: string
  actionKey?: string
  parameterKey?: string
  targetId?: string
  commandKey?: string
  query?: unknown
  input?: unknown
  parameters?: unknown
  payload?: unknown
  message?: string
}
export function isProfileMessage(value: unknown): value is ProfileMessage {
  if (
    !value ||
    typeof value !== 'object' ||
    !('channel' in value) ||
    value.channel !== PROFILE_CHANNEL ||
    !('protocolVersion' in value) ||
    value.protocolVersion !== 1 ||
    !('type' in value) ||
    typeof value.type !== 'string'
  )
    return false
  for (const key of ['instanceId', 'requestId', 'actionKey', 'parameterKey', 'targetId', 'commandKey', 'message']) {
    const field: unknown = Reflect.get(value, key)
    if (field !== undefined && (typeof field !== 'string' || field.length > 2000)) return false
  }
  return true
}
export function interactionHeld(payload: unknown) {
  return !!payload && typeof payload === 'object' && 'busy' in payload && payload.busy === true
}
export function navigationUrl(result: unknown): string | null {
  return result &&
    typeof result === 'object' &&
    'success' in result &&
    result.success === true &&
    'url' in result &&
    typeof result.url === 'string'
    ? result.url
    : null
}
