import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { NamedProviderRegistry } from '../../core/named-provider.registry'
import { WIDGET_ACTION_PROVIDER } from './action.decorator'
import type { IWidgetActionHandler, IWidgetActionProvider } from './types'

const localActionName = /^[a-zA-Z0-9_-]+$/

@Injectable()
export class WidgetActionProviderRegistry extends NamedProviderRegistry<IWidgetActionProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(WIDGET_ACTION_PROVIDER, discovery, reflector)
  }
  protected isProvider(instance: object): instance is IWidgetActionProvider {
    if (
      !('actions' in instance) ||
      !instance.actions ||
      typeof instance.actions !== 'object' ||
      Array.isArray(instance.actions)
    )
      return false
    const entries = Object.entries(instance.actions)
    return (
      entries.length > 0 && entries.every(([name, handler]) => localActionName.test(name) && isActionHandler(handler))
    )
  }

  resolve(action: string): IWidgetActionHandler | undefined {
    const separator = action.lastIndexOf('.')
    if (separator < 1) return undefined
    const name = action.slice(separator + 1)
    if (!localActionName.test(name)) return undefined
    const provider = this.findByName(action.slice(0, separator))
    if (!provider || !Object.prototype.hasOwnProperty.call(provider.actions, name)) return undefined
    return provider.actions[name]
  }
}

function isActionHandler(value: unknown): value is IWidgetActionHandler {
  return (
    !!value &&
    typeof value === 'object' &&
    'execute' in value &&
    typeof value.execute === 'function' &&
    (!('widgetSource' in value) ||
      value.widgetSource === undefined ||
      value.widgetSource === 'message' ||
      value.widgetSource === 'receipt')
  )
}
