import { IntegrationModule, TenantModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { TypeOrmModule } from '@nestjs/typeorm'
import { DiscoveryModule, RouterModule } from '@nestjs/core'
import { XpertWorkspaceController } from './workspace.controller'
import { XpertWorkspace } from './workspace.entity'
import { XpertWorkspaceAccessService } from './workspace-access.service'
import { XpertWorkspaceService } from './workspace.service'
import { QueryHandlers } from './queries/handlers'
import { XpertWorkspaceConnector } from './connectors/workspace-connector.entity'
import { XpertWorkspaceConnectorOAuthSession } from './connectors/workspace-connector-oauth-session.entity'
import { XpertWorkspaceConnectorService } from './connectors/workspace-connector.service'
import { XpertWorkspaceConnectorController } from './connectors/workspace-connector.controller'
import { ConnectorStrategyRegistry } from '@xpert-ai/plugin-sdk'

@Module({
	imports: [
		RouterModule.register([{ path: '/xpert-workspace', module: XpertWorkspaceModule }]),
		TypeOrmModule.forFeature([XpertWorkspace, XpertWorkspaceConnector, XpertWorkspaceConnectorOAuthSession]),
		TenantModule,
		UserOrganizationModule,
		IntegrationModule,
		DiscoveryModule,
		CqrsModule,
	],
	controllers: [XpertWorkspaceController, XpertWorkspaceConnectorController],
	providers: [XpertWorkspaceService, XpertWorkspaceAccessService, XpertWorkspaceConnectorService, ConnectorStrategyRegistry, ...QueryHandlers],
	exports: [XpertWorkspaceService, XpertWorkspaceAccessService, XpertWorkspaceConnectorService]
})
export class XpertWorkspaceModule {}
