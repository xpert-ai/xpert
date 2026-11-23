import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { NamedProviderRegistry } from '../../core/named-provider.registry'
import { MESSAGE_WIDGET_PROVIDER } from './provider.decorator'
import type { IMessageWidgetProvider } from './types'

@Injectable()
export class MessageWidgetProviderRegistry extends NamedProviderRegistry<IMessageWidgetProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(MESSAGE_WIDGET_PROVIDER, discovery, reflector)
  }
  protected isProvider(instance: object): instance is IMessageWidgetProvider {
    return 'resolve' in instance && typeof instance.resolve === 'function'
  }
}
