import type { Repository } from 'typeorm'
import { MCPServerType } from '@xpert-ai/contracts'
import { ConnectorStrategyRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { AgentPluginConnectorService } from './agent-plugin-connector.service'
import { AgentPluginPackage, AgentResourceBinding } from './agent-plugin.entity'
import { ConnectorService } from '../connector/connector.service'
import {
    resolveMcpConsumerAuthProvider,
    type McpConsumerAuthProviderRequest
} from '../mcp-consumer/auth/mcp-consumer-auth.registry'
import { portableMcpSchema, connectorMcpAuth } from './agent-plugin-mcp'

jest.mock('../connector/connector.service', () => ({ ConnectorService: class {} }))
jest.mock('../connector/mcp-oauth.strategy', () => ({
    McpOAuthConnectorStrategy: class {},
    mcpConnectorProvider: () => 'mcp-provider'
}))
jest.mock('./agent-plugin.entity', () => ({ AgentPluginPackage: class {}, AgentResourceBinding: class {} }))
jest.mock('../xpert-toolset/xpert-toolset.entity', () => ({ XpertToolset: class {} }))

describe('Agent Plugin Connector binding boundary', () => {
    const reference = { bindingId: 'connector', provider: 'canva' }
    const requirement = { type: 'existing' as const, provider: 'canva', resource: 'https://provider.example' }
    const server = { key: 'test', config: { type: 'streamable-http' as const, url: 'https://provider.example/mcp' } }
    const auth = connectorMcpAuth(reference, requirement)
    const scope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'user',
        xpertId: 'assistant',
        conversationId: 'conversation',
        executionId: 'execution'
    }
    const toolset = {
        id: 'toolset',
        ...scope,
        workspaceId: 'workspace',
        schema: JSON.stringify(portableMcpSchema(server, false, auth))
    }
    let service: AgentPluginConnectorService
    let owners: jest.Mock
    let credential: jest.Mock
    let connectorBindings: jest.Mock
    let currentToolset: jest.Mock
    let request: McpConsumerAuthProviderRequest

    beforeEach(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const owner = {
            enabled: true,
            workspaceIds: ['workspace'],
            definition: { kind: 'agent_plugin', packageId: 'package', connectorServers: { test: requirement } },
            installations: { workspace: { toolsets: ['toolset'], connectors: { test: reference } } }
        }
        owners = jest.fn().mockResolvedValue([owner])
        currentToolset = jest.fn().mockResolvedValue(toolset)
        credential = jest.fn().mockResolvedValue({
            ...reference,
            scopes: ['read'],
            credentials: { accessToken: 'test-only', resource: requirement.resource }
        })
        connectorBindings = jest.fn()
        service = new AgentPluginConnectorService(
            {
                findOneBy: jest.fn().mockResolvedValue(null),
                findOneByOrFail: jest.fn().mockResolvedValue({ descriptor: { servers: [server] } }),
                manager: { getRepository: () => ({ findOneBy: currentToolset }) }
            } as unknown as Repository<AgentPluginPackage>,
            { find: owners } as unknown as Repository<AgentResourceBinding>,
            {
                getRuntimeConnectorCredentialForScope: credential,
                listBindings: connectorBindings
            } as unknown as ConnectorService,
            {} as ConnectorStrategyRegistry
        )
        await service.onApplicationBootstrap()
        request = {
            toolset,
            serverName: 'test',
            server: { ...server.config, type: MCPServerType.HTTP, auth },
            runtimeScope: scope
        }
    })
    afterEach(() => {
        service.onModuleDestroy()
        jest.restoreAllMocks()
    })

    it.each(['shared', 'personal'] as const)(
        'installs dependencies only onto shared bindings (%s)',
        async (authorizationMode) => {
            jest.spyOn(service, 'register').mockReturnValue(new Map([['test', 'canva']]))
            connectorBindings.mockResolvedValue([{ id: 'connector', provider: 'canva', authorizationMode }])
            const install = service.install({} as AgentPluginPackage, 'workspace', { test: requirement })
            if (authorizationMode === 'shared') await expect(install).resolves.toEqual({ test: reference })
            else await expect(install).rejects.toThrow()
        }
    )

    it('passes only the exact dependency binding and validated actor to Connector', async () => {
        const provider = await resolveMcpConsumerAuthProvider(request)
        expect((await provider.tokens()).access_token).toBe('test-only')
        expect(credential).toHaveBeenLastCalledWith(reference, {
            ...scope,
            connectorBindingIds: ['connector'],
            allowWorkspaceBindingsInProject: true
        })
    })
    it('rechecks package revocation even for an existing MCP connection', async () => {
        const provider = await resolveMcpConsumerAuthProvider(request)
        owners.mockResolvedValue([])
        await expect(provider.tokens()).rejects.toThrow()
        expect(credential).toHaveBeenCalledTimes(1)
    })
    it('denies foreign actor scopes, forged binding IDs and changed server config', async () => {
        await expect(
            resolveMcpConsumerAuthProvider({ ...request, runtimeScope: { ...scope, organizationId: 'other' } })
        ).rejects.toThrow()
        await expect(
            resolveMcpConsumerAuthProvider({
                ...request,
                server: { ...request.server, auth: { ...auth, bindingId: 'other' } }
            })
        ).rejects.toThrow()
        currentToolset.mockResolvedValue({ ...toolset, schema: '{}' })
        await expect(resolveMcpConsumerAuthProvider(request)).rejects.toThrow()
        expect(credential).not.toHaveBeenCalled()
    })
})
