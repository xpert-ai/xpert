import { ForbiddenException } from '@nestjs/common'
import { MCPServerType, type IXpertToolset, type TMCPSchema } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { buildMCPHeaders } from '../xpert-toolset/provider/mcp/headers'
import { prepareMcpAppActorConnection } from './mcp-app-actor-connection'
import type { McpAppInstanceSnapshot } from './mcp-app-instance-store.service'

const toolset: IXpertToolset = {
    id: 'tools',
    name: 'Analysis',
    tenantId: 'tenant',
    organizationId: 'org',
    workspaceId: 'ws'
}
const schema: TMCPSchema = {
    mcpServers: {
        '': { type: MCPServerType.HTTP, headers: { 'x-uose-actor-token': '{{env.oidc_token}}' } },
        other: { type: MCPServerType.HTTP, headers: { authorization: 'Bearer {{env.oidc_token}}' } }
    }
}
const snapshot: McpAppInstanceSnapshot = {
    version: 1,
    stateVersion: 1,
    appInstanceId: 'app',
    tenantId: 'tenant',
    organizationId: 'org',
    workspaceId: 'ws',
    toolsetId: 'tools',
    userId: 'caller',
    serverName: 'Analysis',
    resourceUri: 'ui://analysis',
    toolName: 'report',
    displayName: 'report',
    createdAt: 1,
    expiresAt: 1000,
    executionContext: { xpertId: 'assistant', conversationId: 'chat', executionId: 'execution' }
}
const getToken = jest
    .fn()
    .mockResolvedValue({ token: 'fresh-user-credential', expiresAt: new Date(900_000).toISOString() })
const tokens = { createScopedApi: jest.fn(() => ({ getToken })) }

describe('revived MCP App actor credentials', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('caller')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => {
        jest.restoreAllMocks()
        jest.clearAllMocks()
    })

    it('renders the configured header for the original server and Assistant using the verified caller', async () => {
        const defaults = { env: { locale: 'zh', oidc_token: 'old-workspace-value' } }
        const result = await prepareMcpAppActorConnection(toolset, schema, defaults, snapshot, tokens)
        expect(Object.keys(result.schema.mcpServers!)).toEqual([''])
        expect(
            await buildMCPHeaders(
                result.schema.mcpServers![''].headers,
                result.environment,
                snapshot.executionContext!.xpertId
            )
        ).toEqual({ 'x-uose-actor-token': 'fresh-user-credential', 'x-assistant-code': 'assistant' })
        expect(tokens.createScopedApi).toHaveBeenCalledWith({
            userId: 'caller',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'ws',
            ...snapshot.executionContext
        })
        expect(result.actor?.expiresAt).toBe(900_000)
        expect(defaults.env.oidc_token).toBe('old-workspace-value')
        expect(JSON.stringify(snapshot)).not.toContain('fresh-user-credential')
    })

    it.each([
        { userId: 'other' },
        { tenantId: 'other' },
        { organizationId: 'other' },
        { workspaceId: 'other' },
        { toolsetId: 'other' },
        { userId: undefined },
        { executionContext: undefined }
    ])('rejects an unbound or mismatched actor before minting (%j)', async (mismatch) => {
        await expect(
            prepareMcpAppActorConnection(toolset, schema, null, { ...snapshot, ...mismatch }, tokens)
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(tokens.createScopedApi).not.toHaveBeenCalled()
    })
    it('recovers the execution organization for a tenant-shared toolset', async () => {
        await prepareMcpAppActorConnection(
            { ...toolset, organizationId: undefined },
            schema,
            null,
            {
                ...snapshot,
                organizationId: undefined,
                executionContext: { ...snapshot.executionContext!, organizationId: 'org' }
            },
            tokens
        )
        expect(tokens.createScopedApi).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 'org' }))
    })
    it('does not send a bearer to an endpoint without an actor header', async () => {
        const plain: TMCPSchema = {
            servers: { Analysis: { type: MCPServerType.HTTP, headers: { 'X-Locale': '{{env.locale}}' } } }
        }
        expect(await prepareMcpAppActorConnection(toolset, plain, { env: { locale: 'zh' } }, snapshot, tokens)).toEqual(
            { schema: plain, environment: { env: { locale: 'zh' } } }
        )
        expect(tokens.createScopedApi).not.toHaveBeenCalled()
    })
})
