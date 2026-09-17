import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry, StrategySource } from '../../strategy'
import { KEYWORD_ANALYZER_STRATEGY } from './strategy.decorator'
import { IKeywordAnalyzerStrategy } from './strategy.interface'

@Injectable()
export class KeywordAnalyzerRegistry extends BaseStrategyRegistry<IKeywordAnalyzerStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(KEYWORD_ANALYZER_STRATEGY, discoveryService, reflector)
  }

  /** Resolve a pinned source without allowing a higher-priority scope to shadow it. */
  getBySource(provider: string, source: StrategySource, organizationId?: string): IKeywordAnalyzerStrategy | undefined {
    if (!this.resolveStrategyScopeKeys(organizationId).includes(source.scopeKey)) return undefined
    const strategy = this.strategies.get(source.scopeKey)?.get(provider)
    if (!strategy) return undefined
    const registered = this.getSource(strategy)
    if (registered.kind !== source.kind || registered.scopeKey !== source.scopeKey) return undefined
    if (source.kind === 'plugin' && (registered.kind !== 'plugin' || registered.pluginName !== source.pluginName)) {
      return undefined
    }
    return strategy
  }
}
