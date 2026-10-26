import { QueryBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { User } from '@xpert-ai/server-core'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertProjectService } from '../../xpert-project/project.service'
import { AuthorizeAssistantMcpHandler } from '../../xpert/mcp-access/authorize-assistant-mcp.handler'
import { AuthorizePublicationMcpHandler } from '../../mcp-publication/control/authorize-publication-mcp.handler'
import { McpPublicationAuthorizationService } from '../../mcp-publication/mcp-publication-authorization.service'
import { McpPublicationAccessService } from '../../mcp-publication/mcp-publication-access.service'
import { McpPublicationService } from '../../mcp-publication/mcp-publication.service'
import { McpClientConnectionService } from '../runtime/mcp-client-connection.service'
import { publication, principal, capability } from '../../mcp-publication/testing/fixtures'
import { McpPublication } from '../../mcp-publication/entities'
import { McpOperationTransport } from './mcp-operation.transport'
import {
    AuthorizeAssistantMcpQuery,
    AuthorizePublicationMcpQuery,
    withMcpPublicationAuthority
} from './mcp-operation-authority'

const workspaceId = '10000000-0000-4000-8000-000000000004',
    xpertId = '10000000-0000-4000-8000-000000000008'
function repository<T extends object>(value: T) {
    return Object.assign(Object.create(Repository.prototype) as Repository<T>, {
        findOne: jest.fn(async () => value),
        findOneOrFail: jest.fn(async () => value),
        findOneBy: jest.fn(async () => value)
    })
}
describe('MCP runtime authority remains with the original business grant', () => {
    afterEach(() => jest.restoreAllMocks())
    it('does not require authoring access for an authorized published Assistant and denies a revoked grant', async () => {
        const read = jest.fn(async () => ({ workspaceId })),
            author = jest.fn(async () => {
                throw new Error('not author')
            })
        const published = Object.assign(
            Object.create(PublishedXpertAccessService.prototype) as PublishedXpertAccessService,
            { getAccessiblePublishedXpert: read }
        )
        const workspace = Object.assign(
            Object.create(XpertWorkspaceAccessService.prototype) as XpertWorkspaceAccessService,
            { assertCanAuthor: author }
        )
        const handler = new AuthorizeAssistantMcpHandler(
            published,
            workspace,
            Object.create(XpertProjectService.prototype) as XpertProjectService
        )
        await expect(handler.execute(new AuthorizeAssistantMcpQuery(xpertId, workspaceId))).resolves.toBeUndefined()
        expect(author).not.toHaveBeenCalled()
        read.mockRejectedValueOnce(new Error('grant revoked'))
        await expect(handler.execute(new AuthorizeAssistantMcpQuery(xpertId, workspaceId))).rejects.toThrow(
            'not author'
        )
        await expect(handler.execute(new AuthorizeAssistantMcpQuery(xpertId, 'other'))).rejects.toThrow()
    })
    it('reauthorizes a service-account Publication without fabricating a user or requiring workspace authoring', async () => {
        const p = { ...principal(), subjectType: 'service_account' as const, userId: undefined }
        const toolset = Object.assign(new XpertToolset(), {
            id: capability().toolsetId,
            workspaceId,
            tenantId: p.tenantId,
            organizationId: p.organizationId,
            schema: JSON.stringify({ servers: {} }),
            tools: []
        })
        const users = repository(new User())
        const binding = capability()
        binding.enabled = true
        binding.descriptorSnapshot.requiredContext = ['principal', 'execution']
        const catalog = Object.assign(Object.create(McpPublicationService.prototype) as McpPublicationService, {
            resolveRuntimeCapabilities: jest.fn(async () => [binding])
        })
        const auth = new McpPublicationAuthorizationService(
            users,
            Object.create(McpPublicationAccessService.prototype) as McpPublicationAccessService
        )
        const handler = new AuthorizePublicationMcpHandler(repository(publication()), catalog, auth)
        const queries = Object.create(QueryBus.prototype) as QueryBus
        jest.spyOn(queries, 'execute').mockImplementation(async (query) => {
            if (!(query instanceof AuthorizePublicationMcpQuery)) throw new Error('wrong authority')
            await handler.execute(query)
        })
        const connections = Object.assign(
            Object.create(McpClientConnectionService.prototype) as McpClientConnectionService,
            {
                pin: jest.fn(async () => {
                    throw new Error('authoring must not be used')
                })
            }
        )
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(p.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(p.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        const transport = new McpOperationTransport(connections, repository(toolset), users, queries)
        const scope = await withMcpPublicationAuthority(p, () =>
            transport.prepare(toolset.id, 'third-party', 'long_task')
        )
        expect(scope.scope.actor.userId).toBeNull()
        expect(scope.scope.authority).toMatchObject({
            kind: 'publication',
            principal: { subjectType: 'service_account' }
        })
        expect(users.findOne).not.toHaveBeenCalled()
        expect(connections.pin).not.toHaveBeenCalled()
        binding.enabled = false
        await expect(
            withMcpPublicationAuthority(p, () => transport.prepare(toolset.id, 'third-party', 'long_task'))
        ).rejects.toThrow()
    })
})
