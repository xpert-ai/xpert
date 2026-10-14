import type { ConnectorStrategyRuntime } from '@xpert-ai/plugin-sdk'

/** Keep historical bindings manageable while presenting one entry for an unbound native provider. */
export function connectorCatalog(strategies: ConnectorStrategyRuntime[], bindings: { provider: string }[]) {
    const bound = new Set(bindings.map((binding) => binding.provider))
    const replacements = new Set(strategies.map((strategy) => strategy.definition.canonicalProvider).filter(Boolean))
    return strategies.filter(
        ({ definition }) => !replacements.has(definition.provider) || bound.has(definition.provider)
    )
}
