import { Global, Module } from '@nestjs/common'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { ViewExtensionProviderRegistry } from '@xpert-ai/plugin-sdk'
import { IntegrationModule } from '../integration/integration.module'
import { IntegrationViewHostDefinition } from './hosts/integration-view-host.definition'
import { ViewHostDefinitionRegistry } from './host-definition.registry'
import { IntegrationViewHostCacheSubscriber } from './subscribers/integration-view-host-cache.subscriber'
import { ViewExtensionCacheService } from './view-extension.cache.service'
import { ViewExtensionController } from './view-extension.controller'
import { ViewExtensionPermissionService } from './view-extension.permission.service'
import { ViewExtensionService } from './view-extension.service'

@Global()
@Module({
  imports: [
    RouterModule.register([{ path: '/view-hosts', module: ViewExtensionModule }]),
    DiscoveryModule,
    IntegrationModule
  ],
  controllers: [ViewExtensionController],
  providers: [
    ViewExtensionProviderRegistry,
    ViewHostDefinitionRegistry,
    ViewExtensionPermissionService,
    ViewExtensionCacheService,
    ViewExtensionService,
    IntegrationViewHostDefinition,
    IntegrationViewHostCacheSubscriber
  ],
  exports: [
    ViewHostDefinitionRegistry,
    ViewExtensionService,
    ViewExtensionCacheService,
    ViewExtensionPermissionService
  ]
})
export class ViewExtensionModule {}
