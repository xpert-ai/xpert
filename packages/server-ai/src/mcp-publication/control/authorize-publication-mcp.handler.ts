import { QueryHandler, IQueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { AuthorizePublicationMcpQuery } from '../../mcp-consumer/execution/mcp-operation-authority'
import { McpControlError } from '../../mcp-consumer/execution/mcp-control.error'
import { McpPublication } from '../entities'
import { McpPublicationService } from '../mcp-publication.service'
import { McpPublicationAuthorizationService } from '../mcp-publication-authorization.service'
import { assertInvocationAllowed, supportsMcpContext } from '../mcp-runtime-protocol'

@QueryHandler(AuthorizePublicationMcpQuery)
export class AuthorizePublicationMcpHandler implements IQueryHandler<AuthorizePublicationMcpQuery> {
    constructor(
        @InjectRepository(McpPublication) private readonly publications: Repository<McpPublication>,
        private readonly catalog: McpPublicationService,
        private readonly authorization: McpPublicationAuthorizationService
    ) {}
    async execute({ principal, toolsetId, serverName, toolName }: AuthorizePublicationMcpQuery) {
        const publication = await this.publications.findOneBy({
            id: principal.publicationId,
            tenantId: principal.tenantId,
            status: 'active'
        })
        if (!publication) throw new McpControlError('scope')
        await this.authorization.assertCanRun(publication, principal)
        const bindings = await this.catalog.resolveRuntimeCapabilities(publication)
        const binding = bindings.find(
            (item) =>
                item.enabled &&
                item.toolsetId === toolsetId &&
                item.descriptorSnapshot.capabilityType === 'tool' &&
                item.descriptorSnapshot.source.serverName === serverName &&
                item.descriptorSnapshot.source.remoteName === toolName
        )
        if (
            !binding ||
            binding.descriptorSnapshot.capabilityType !== 'tool' ||
            !supportsMcpContext(binding.descriptorSnapshot, principal)
        )
            throw new McpControlError('scope')
        // Delayed calls carry the narrowed tools:call grant, not a discovery grant.
        assertInvocationAllowed(principal, binding, binding.descriptorSnapshot)
    }
}
