import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

/** A name is unique within its registration category and installation scope. */
export interface PluginProviderRegistration {
  kind: string
  key: string
}

const kindPrefix = 'xpert:provider-registration:'

/** Declares a plugin-owned strategy category with a stable metadata key across SDK copies. */
export function definePluginRegistration(metadataKey: string, kind = metadataKey) {
  if (
    !metadataKey ||
    metadataKey.trim() !== metadataKey ||
    metadataKey === STRATEGY_META_KEY ||
    metadataKey.startsWith(kindPrefix)
  )
    throw new Error('Invalid provider registration metadata key')
  if (!kind || kind.trim() !== kind) throw new Error('A provider registration requires an exact category')
  return (name: string) => {
    if (!name || name.trim() !== name) throw new Error('A provider registration requires an exact name')
    return applyDecorators(
      Injectable(),
      SetMetadata(STRATEGY_META_KEY, metadataKey),
      SetMetadata(metadataKey, name),
      SetMetadata(kindPrefix + metadataKey, kind)
    )
  }
}

export function assertPluginRegistrationOwner(name: string, pluginName?: string) {
  const separator = name.indexOf(':')
  const owner = separator < 0 ? undefined : name.slice(0, separator)
  const localName = name.slice(separator + 1)
  if (owner !== pluginName || name.trim() !== name || !/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(localName))
    throw new Error(`Registration '${name}' does not belong to ${pluginName ?? 'the platform'}`)
}

export function readPluginProviderRegistrations(target: object, pluginName: string): PluginProviderRegistration[] {
  const claims: PluginProviderRegistration[] = []
  for (const key of Reflect.getMetadataKeys(target)) {
    if (typeof key !== 'string' || !key.startsWith(kindPrefix)) continue
    const metadataKey = key.slice(kindPrefix.length)
    const kind: unknown = Reflect.getMetadata(key, target)
    if (typeof kind !== 'string' || !kind.trim() || kind.trim() !== kind)
      throw new Error(`Invalid provider registration category for '${metadataKey}'`)
    const name: unknown = Reflect.getMetadata(metadataKey, target)
    if (typeof name !== 'string') throw new Error(`Invalid ${kind} registration name`)
    assertPluginRegistrationOwner(name, pluginName)
    claims.push({ kind, key: name })
  }
  return claims
}
