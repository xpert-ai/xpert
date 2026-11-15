export const REMOTE_COMPONENT_CHANNEL = 'xpertai.remote_component'
export const REMOTE_COMPONENT_PROTOCOL_VERSION = 1

export type RemoteComponentMessage = {
  channel?: string
  protocolVersion?: number
  instanceId?: string | null
  type?: string
  requestId?: string
  [key: string]: unknown
}

export function isRemoteComponentMessage(value: unknown): value is RemoteComponentMessage {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    'channel' in value &&
    value.channel === REMOTE_COMPONENT_CHANNEL &&
    'protocolVersion' in value &&
    value.protocolVersion === REMOTE_COMPONENT_PROTOCOL_VERSION
  )
}
