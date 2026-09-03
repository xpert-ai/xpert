import { IPluginComponentDefinition } from '@cloud/app/@core/state'

export function isRuntimeNativeMcp(component: Pick<IPluginComponentDefinition, 'metadata'>) {
  return (
    readMetadataBoolean(component.metadata, 'runtimeDiscovered') && readMetadataBoolean(component.metadata, 'nativeMcp')
  )
}

export function runtimeMcpProviderName(component: IPluginComponentDefinition) {
  return readConfigString(component.config, 'name') ?? component.componentKey
}

export function runtimeMcpProviderDescription(component: IPluginComponentDefinition) {
  return readConfigString(component.config, 'description')
}

export function runtimeMcpProviderKey(component: IPluginComponentDefinition) {
  return readConfigString(component.config, 'provider') ?? component.componentKey
}

export function runtimeMcpProviderToolCount(component: IPluginComponentDefinition) {
  return readConfigNumber(component.config, 'toolCount') ?? 0
}

function readMetadataBoolean(value: unknown, key: string) {
  return !!value && typeof value === 'object' && Reflect.get(value, key) === true
}

function readConfigString(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const field = Reflect.get(value, key)
  return typeof field === 'string' && field.trim() ? field.trim() : null
}

function readConfigNumber(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const field = Reflect.get(value, key)
  return typeof field === 'number' && Number.isFinite(field) ? field : null
}
