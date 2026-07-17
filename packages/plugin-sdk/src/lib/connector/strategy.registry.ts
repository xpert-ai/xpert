import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry, isStrategyInstance, resolveStrategyMetadataTarget } from '../strategy'
import { CONNECTOR_STRATEGY } from './strategy.decorator'
import { assertConnectorDefinition, type ConnectorStrategy, type ConnectorStrategyRuntime } from './strategy.interface'

@Injectable()
export class ConnectorStrategyRegistry extends BaseStrategyRegistry<ConnectorStrategyRuntime> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(CONNECTOR_STRATEGY, discoveryService, reflector)
  }

  override upsert(instance: unknown): void {
    const target = resolveStrategyMetadataTarget(instance)
    if (!target) {
      return
    }

    const provider = this.reflector.get<string>(CONNECTOR_STRATEGY, target)
    if (provider) {
      const definition = readConnectorDefinition(instance, target)
      if (definition === undefined) {
        throw new Error(`Connector strategy '${provider}' must expose a connector definition`)
      }
      assertConnectorDefinition(definition)
      if (definition.provider !== provider) {
        throw new Error(`Connector strategy '${provider}' definition declares provider '${definition.provider}'`)
      }
    }

    super.upsert(instance)
  }

  override get(type: string, organizationId?: string): ConnectorStrategy {
    const strategy = super.get(type, organizationId)
    if (!isLegacyConnectorStrategy(strategy)) {
      throw new Error(`Connector strategy '${type}' does not implement the legacy OAuth contract`)
    }
    return strategy
  }

  override list(organizationId?: string): ConnectorStrategy[] {
    return super.list(organizationId).filter(isLegacyConnectorStrategy)
  }

  getRuntime(type: string, organizationId?: string): ConnectorStrategyRuntime {
    return super.get(type, organizationId)
  }

  listRuntime(organizationId?: string): ConnectorStrategyRuntime[] {
    return super.list(organizationId)
  }
}

function readConnectorDefinition(instance: unknown, target: object): unknown {
  if (isStrategyInstance(instance)) {
    const definition: unknown = Reflect.get(instance, 'definition')
    if (definition !== undefined) {
      return definition
    }
  }
  return Reflect.get(target, 'definition')
}

function isLegacyConnectorStrategy(strategy: ConnectorStrategyRuntime): strategy is ConnectorStrategy {
  return (
    'auth' in strategy.definition &&
    strategy.definition.auth?.type === 'oauth2' &&
    typeof strategy.buildAuthorizationUrl === 'function' &&
    typeof strategy.exchangeOAuthCode === 'function'
  )
}
