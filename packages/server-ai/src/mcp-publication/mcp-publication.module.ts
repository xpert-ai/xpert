import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { RedisModule, User } from '@xpert-ai/server-core'
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
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'

@Module({
    imports: [
        TypeOrmModule.forFeature([...MCP_PUBLICATION_ENTITIES, XpertToolset, User]),
        RedisModule,
        XpertToolsetModule
    ],
    controllers: [McpPublicationController, McpPublicationManagementController, McpOAuthMetadataController],
    providers: [
        McpPublicationService,
        McpApiKeyService,
        McpPublicationAuthorizationService,
        McpRateLimitService,
        McpInvocationAuditService,
        McpCapabilityCatalogService,
        McpAppBundleService,
        McpAuthenticationService,
        McpOAuthService,
        McpElicitationService,
        McpTaskService,
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
        McpCapabilityCatalogService
    ]
})
export class McpPublicationModule {}
