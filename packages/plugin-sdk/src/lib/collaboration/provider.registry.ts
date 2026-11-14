import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { COLLABORATION_DOCUMENT_PROVIDER } from './provider.decorator'
import type { CollaborationProvider } from './types'

/** Discovers system and organization-scoped collaboration providers from loaded plugins. */
@Injectable()
export class CollaborationDocumentProviderRegistry extends BaseStrategyRegistry<CollaborationProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(COLLABORATION_DOCUMENT_PROVIDER, discoveryService, reflector)
  }
}
