import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { ConnectorStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { ConnectorPersonalAccount } from './connector-personal-account.entity'
import { ConnectorPersonalGrant } from './connector-personal-grant.entity'
import { ConnectorRuntimeAudit } from './connector-runtime-audit.entity'
import { ConnectorController } from './connector.controller'
import { Connector } from './connector.entity'
import { ConnectorService } from './connector.service'

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
        UserOrganizationModule,
        DiscoveryModule,
        CqrsModule,
        XpertWorkspaceModule
    ],
    controllers: [ConnectorController],
    providers: [ConnectorService, ConnectorStrategyRegistry],
    exports: [ConnectorService]
})
export class ConnectorModule {}
