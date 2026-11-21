import { Logger } from '@nestjs/common'
import { BaseStrategyRegistry, resolveStrategyMetadataTarget, type StrategySource } from '../strategy'
import { assertPluginRegistrationOwner } from './provider-registration'

/** Opt-in registry for validated, owner-qualified providers that cannot replace a different live instance. */
export abstract class NamedProviderRegistry<T extends object> extends BaseStrategyRegistry<T> {
  private readonly providerLogger = new Logger(this.constructor.name)

  protected abstract isProvider(instance: object): instance is T

  override upsert(instance: unknown) {
    const target = resolveStrategyMetadataTarget(instance)
    const name: unknown = target && this.reflector.get(this.strategyKey, target)
    if (name == null) return
    if (typeof name !== 'string' || !name) throw new Error(`Invalid ${this.strategyKey} registration name`)
    if (!instance || typeof instance !== 'object' || !this.isProvider(instance))
      throw new Error(`Invalid ${this.strategyKey} provider '${name}'`)
    this.register(name, instance, this.getSource(instance))
  }

  override assertCanRegister(name: string, instance: T, source: StrategySource) {
    assertPluginRegistrationOwner(name, source.kind === 'plugin' ? source.pluginName : undefined)
    const current = this.strategies.get(source.scopeKey)?.get(name)
    if (current && current !== instance) throw new Error(`Provider '${name}' is already registered in this scope`)
    super.assertCanRegister(name, instance, source)
  }

  protected override onRegistrationError(error: unknown) {
    this.providerLogger.warn(error instanceof Error ? error.message : 'Invalid provider registration')
  }
}
