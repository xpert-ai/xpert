import { ResolveTemplateConnectorsHandler } from './template-connectors.handler'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { IntegrationModule, TenantModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { ConnectorStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { ConnectorPersonalAccount } from './connector-personal-account.entity'
import { ConnectorPersonalGrant } from './connector-personal-grant.entity'
import { ConnectorRuntimeAudit } from './connector-runtime-audit.entity'
import { ConnectorController } from './connector.controller'
import { Connector } from './connector.entity'
import { ConnectorService } from './connector.service'
import { ConnectorProviderService } from './connector-provider.service'
import { RuntimeCapabilityModule } from '../shared/runtime/runtime-capability.module'
import { ConnectorIntegrationController } from './integrations/connector-integration.controller'
import { ConnectorIntegrationService } from './integrations/connector-integration.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/connector', module: ConnectorModule }]),
        TypeOrmModule.forFeature([
            Connector,
            ConnectorOAuthSession,
            ConnectorPersonalAccount,
            ConnectorPersonalGrant,
            ConnectorRuntimeAudit
        ]),
        TenantModule,
        IntegrationModule,
        UserOrganizationModule,
        DiscoveryModule,
        RuntimeCapabilityModule,
        CqrsModule,
        XpertWorkspaceModule
    ],
    controllers: [ConnectorIntegrationController, ConnectorController],
    providers: [
        ConnectorService,
        ConnectorProviderService,
        ConnectorStrategyRegistry,
        ConnectorIntegrationService,
        ResolveTemplateConnectorsHandler
    ],
    exports: [ConnectorService, ConnectorStrategyRegistry]
})
export class ConnectorModule {}
