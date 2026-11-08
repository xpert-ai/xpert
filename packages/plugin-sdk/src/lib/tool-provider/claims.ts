import type { StrategySource } from '../strategy'
import type { XpertToolProviderDescriptor } from './types'

export interface XpertToolProviderClaim {
  source: StrategySource
  descriptor: XpertToolProviderDescriptor
}

function sameOwner(left: StrategySource, right: StrategySource) {
  return left.kind === 'plugin'
    ? right.kind === 'plugin' && left.pluginName === right.pluginName
    : right.kind === 'builtin'
}

/** Component keys belong to a plugin; public strategy and Tool names retain their scope-wide claims. */
export function assertXpertToolProviderClaims(candidate: XpertToolProviderClaim, existing: XpertToolProviderClaim[]) {
  const { source, descriptor } = candidate
  const tools = new Set(descriptor.tools.map(({ options }) => options.name))
  for (const other of existing) {
    if (other.source.scopeKey !== source.scopeKey) continue
    const owner = sameOwner(source, other.source)
    const otherOwner = other.source.kind === 'plugin' ? other.source.pluginName : 'built-in providers'
    if (other.descriptor.options.provider === descriptor.options.provider) {
      if (owner) continue // A new instance/version may replace the same owner's registration.
      throw new Error(
        `Provider '${descriptor.options.provider}' is already registered by '${otherOwner}' in scope '${source.scopeKey}'.`
      )
    }
    if (owner && other.descriptor.options.componentKey === descriptor.options.componentKey) {
      throw new Error(
        `Component key '${descriptor.options.componentKey}' is already registered for '${otherOwner}' in scope '${source.scopeKey}'.`
      )
    }
    const duplicate = other.descriptor.tools.find(({ options }) => tools.has(options.name))
    if (duplicate) {
      throw new Error(
        `Tool '${duplicate.options.name}' is already registered by '${otherOwner}' in scope '${source.scopeKey}'.`
      )
    }
  }
}
