import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { TenantModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { ConnectorStrategyRegistry } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { ConnectorOAuthSession } from './connector-oauth-session.entity'
import { ConnectorController } from './connector.controller'
import { Connector } from './connector.entity'
import { ConnectorService } from './connector.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/connector', module: ConnectorModule }]),
        TypeOrmModule.forFeature([Connector, ConnectorOAuthSession]),
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
