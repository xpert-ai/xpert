import { AuthorizePublicationMcpHandler } from './control/authorize-publication-mcp.handler'
import { McpTaskControlStore } from './control/mcp-task-control.store'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule, User, TaskControlModule } from '@xpert-ai/server-core'
import { MCP_PUBLICATION_ENTITIES } from './entities'
import { XpertToolsetModule } from '../xpert-toolset'
import { McpPublicationService } from './mcp-publication.service'
import { McpApiKeyService } from './mcp-api-key.service'
import { McpPublicationAuthorizationService } from './mcp-publication-authorization.service'
import { McpRateLimitService } from './mcp-rate-limit.service'
import { McpInvocationAuditService } from './mcp-invocation-audit.service'
import { McpPublicationRuntimeService } from './mcp-publication-runtime.service'
import { McpPublicationController } from './mcp-publication.controller'
import { McpPublicationManagementController } from './mcp-publication-management.controller'
import { McpCapabilityCatalogService } from './mcp-capability-catalog.service'
import { McpAppBundleService } from './mcp-app-bundle.service'
import { McpAuthenticationService } from './mcp-authentication.service'
import { McpOAuthService } from './mcp-oauth.service'
import { McpOAuthMetadataController } from './mcp-oauth-metadata.controller'
import { McpElicitationService } from './mcp-elicitation.service'
import { McpTaskService } from './mcp-task.service'
import { McpTaskProcessor } from './mcp-task.processor'
import { McpPublicationAccessService } from './mcp-publication-access.service'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { WorkspaceFilesRuntimeModule } from '../shared/runtime/workspace-files-runtime.module'
import { McpFilesController, McpFilesGuard } from './mcp-files.controller'
import { McpFilesService } from './mcp-files.service'
import { McpTaskExecutionService } from './mcp-task-execution.service'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { McpSourceConfigurationController } from './configuration/configuration.controller'
import { McpSourceConfigurationService } from './configuration/configuration.service'

@Module({
    imports: [
        TaskControlModule,
        TypeOrmModule.forFeature([...MCP_PUBLICATION_ENTITIES, XpertToolset, User]),
        RedisModule,
        XpertWorkspaceModule,
        WorkspaceFilesRuntimeModule,
        XpertToolsetModule
    ],
    controllers: [
        McpSourceConfigurationController,
        McpPublicationController,
        McpPublicationManagementController,
        McpOAuthMetadataController,
        McpFilesController
    ],
    providers: [
        AuthorizePublicationMcpHandler,
        McpSourceConfigurationService,
        McpFilesGuard,
        McpFilesService,
        McpPublicationService,
        McpApiKeyService,
        McpPublicationAuthorizationService,
        McpPublicationAccessService,
        McpRateLimitService,
        McpInvocationAuditService,
        McpCapabilityCatalogService,
        McpAppBundleService,
        McpAuthenticationService,
        McpOAuthService,
        McpElicitationService,
        McpTaskService,
        McpTaskControlStore,
        McpTaskExecutionService,
        McpTaskProcessor,
        McpPublicationRuntimeService
    ],
    exports: [
        TypeOrmModule,
        McpPublicationService,
        McpApiKeyService,
        McpOAuthService,
        McpInvocationAuditService,
        McpTaskService,
        McpCapabilityCatalogService,
        McpPublicationAccessService
    ]
})
export class McpPublicationModule {}
