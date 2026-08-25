import {
    Body,
    Controller,
    Delete,
    Get,
    Inject,
    Optional,
    Param,
    ParseArrayPipe,
    Patch,
    Post,
    Put,
    Query,
    UseGuards,
    UsePipes,
    ValidationPipe
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { ConfigService } from '@xpert-ai/server-config'
import { RolesEnum } from '@xpert-ai/contracts'
import { RoleGuard, Roles } from '@xpert-ai/server-core'
import { McpApiKeyService } from './mcp-api-key.service'
import {
    CreateMcpApiKeyInput,
    CreateMcpPublicationInput,
    McpCapabilityBindingInput,
    PatchMcpCapabilityBindingInput,
    UpsertMcpOAuthPolicyInput,
    UpdateMcpPublicationInput
} from './mcp-publication.dto'
import { McpInvocationAuditService } from './mcp-invocation-audit.service'
import { McpPublicationService } from './mcp-publication.service'
import { McpOAuthService } from './mcp-oauth.service'
import { McpCapabilityCatalogService } from './mcp-capability-catalog.service'
import { mcpPublicationPublicUrl } from './mcp-publication-url'
import { mcpCapabilityProviderInstructions, mcpPublicationInstructions } from './mcp-publication-runtime.service'
import { assertMcpOAuthEnabled } from './mcp-oauth-feature'

@ApiTags('MCP Publications')
@Controller()
@UseGuards(RoleGuard)
@Roles(RolesEnum.SUPER_ADMIN)
@UsePipes(new ValidationPipe({ forbidNonWhitelisted: true, transform: true, whitelist: true }))
export class McpPublicationManagementController {
    constructor(
        private readonly publications: McpPublicationService,
        private readonly apiKeys: McpApiKeyService,
        private readonly audit: McpInvocationAuditService,
        private readonly oauth: McpOAuthService,
        private readonly capabilityCatalog: McpCapabilityCatalogService,
        @Optional() @Inject(ConfigService) private readonly configService?: ConfigService
    ) {}

    @Post('mcp-publications')
    create(@Body() input: CreateMcpPublicationInput) {
        return this.publications.create(input)
    }

    @Get('mcp-publications')
    list() {
        return this.publications.list()
    }

    @Get('mcp-publications/:id')
    get(@Param('id') id: string) {
        return this.publications.getManaged(id, ['capabilities'])
    }

    @Patch('mcp-publications/:id')
    update(@Param('id') id: string, @Body() input: UpdateMcpPublicationInput) {
        return this.publications.update(id, input)
    }

    @Delete('mcp-publications/:id')
    remove(@Param('id') id: string) {
        return this.publications.remove(id)
    }

    @Post('mcp-publications/:id/enable')
    enable(@Param('id') id: string) {
        return this.publications.enable(id)
    }

    @Post('mcp-publications/:id/disable')
    disable(@Param('id') id: string) {
        return this.publications.disable(id)
    }

    @Get('mcp-publications/:id/available-capabilities')
    availableCapabilities(@Param('id') id: string, @Query('toolsetId') toolsetId?: string) {
        return this.publications.availableCapabilities(id, toolsetId)
    }

    @Get('mcp-publications/:id/available-capability-sources')
    availableCapabilitySources(@Param('id') id: string) {
        return this.publications.availableCapabilitySources(id)
    }

    @Post('mcp-capability-catalog/toolsets/:toolsetId/discover')
    discoverToolsetCapabilities(@Param('toolsetId') toolsetId: string) {
        return this.capabilityCatalog.discoverAndReplaceMcpToolset(toolsetId)
    }

    @Put('mcp-publications/:id/capabilities')
    replaceCapabilities(
        @Param('id') id: string,
        @Body(
            new ParseArrayPipe({
                forbidNonWhitelisted: true,
                items: McpCapabilityBindingInput,
                whitelist: true
            })
        )
        input: McpCapabilityBindingInput[]
    ) {
        return this.publications.replaceCapabilities(id, input)
    }

    @Patch('mcp-publications/:id/capabilities/:capabilityId')
    patchCapability(
        @Param('id') id: string,
        @Param('capabilityId') capabilityId: string,
        @Body() input: PatchMcpCapabilityBindingInput
    ) {
        return this.publications.patchCapability(id, capabilityId, input)
    }

    @Post('mcp-publications/:id/api-keys')
    createApiKey(@Param('id') id: string, @Body() input: CreateMcpApiKeyInput) {
        return this.apiKeys.create(id, input)
    }

    @Get('mcp-publications/:id/api-keys')
    listApiKeys(@Param('id') id: string) {
        return this.apiKeys.list(id)
    }

    @Post('mcp-api-keys/:keyId/revoke')
    revokeApiKey(@Param('keyId') keyId: string) {
        return this.apiKeys.revoke(keyId)
    }

    @Post('mcp-api-keys/:keyId/rotate')
    rotateApiKey(@Param('keyId') keyId: string) {
        return this.apiKeys.rotate(keyId)
    }

    @Get('mcp-publications/:id/oauth-policy')
    oauthPolicy(@Param('id') id: string) {
        assertMcpOAuthEnabled()
        return this.oauth.getManaged(id)
    }

    @Put('mcp-publications/:id/oauth-policy')
    upsertOAuthPolicy(@Param('id') id: string, @Body() input: UpsertMcpOAuthPolicyInput) {
        assertMcpOAuthEnabled()
        return this.oauth.upsert(id, input)
    }

    @Post('mcp-publications/:id/oauth-policy/test')
    testOAuthPolicy(@Param('id') id: string) {
        assertMcpOAuthEnabled()
        return this.oauth.test(id)
    }

    @Get('mcp-publications/:id/audit')
    async auditLog(@Param('id') id: string, @Query('take') take?: string, @Query('skip') skip?: string) {
        await this.publications.getManaged(id)
        return this.audit.search(id, Number(skip), Number(take))
    }

    @Post('mcp-publications/:id/test')
    test(@Param('id') id: string) {
        return this.publications.test(id)
    }

    @Get('mcp-publications/:id/connection-info')
    async connectionInfo(@Param('id') id: string) {
        const publication = await this.publications.getManaged(id, ['capabilities'])
        const capabilities = await this.publications.resolveRuntimeCapabilities(publication)
        return {
            protocolVersion: publication.protocolVersion,
            transport: 'streamable-http',
            endpoint: mcpPublicationPublicUrl(this.configService, `/api/mcp/p/${encodeURIComponent(publication.slug)}`),
            authorization: 'Bearer',
            serverInstructions: mcpPublicationInstructions(
                publication.instructions,
                mcpCapabilityProviderInstructions(capabilities)
            )
        }
    }
}
