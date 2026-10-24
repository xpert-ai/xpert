import { Test } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Integration } from '@xpert-ai/server-core'
import {
    AnalyticsProviderRegistry,
    type AnalyticsAuthoringScope,
    type AnalyticsQueryProvider
} from '@xpert-ai/plugin-sdk'
import { Xpert } from '../xpert/xpert.entity'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertWorkspaceAccessService } from '../xpert-workspace/workspace-access.service'
import { AnalyticsAuthoringService } from './analytics-authoring.service'
import { AnalyticsDefinitionService } from './analytics-definition.service'

const id = '11111111-1111-4111-8111-111111111111'
const actor = { tenantId: id, organizationId: id, userId: id }
const fileApi = { resolveRuntimeReference: jest.fn(), resolveFile: jest.fn(), readBuffer: jest.fn() }
// No provider in these host tests performs file I/O; plugin tests exercise the real capability facade.
const scope: AnalyticsAuthoringScope = { actor, workspaceId: id, xpertId: id, files: fileApi }
const prepare = jest.fn(),
    inspect = jest.fn(),
    authorize = jest.fn(),
    create = jest.fn(),
    access = jest.fn()
const assistants = { findOneBy: jest.fn() },
    toolsets = { find: jest.fn() },
    integrations = { find: jest.fn() }
let service: AnalyticsAuthoringService
const providers: AnalyticsQueryProvider[] = ['workspace-files', 'rest-toolset', 'mcp-toolset', 'integration'].map(
    (connection: 'workspace-files' | 'rest-toolset' | 'mcp-toolset' | 'integration') => ({
        descriptor: { id: connection, name: connection, sourceKinds: ['definition'], operations: [] },
        configuration: { kind: 'definition', connection, schema: {} },
        authoring: {
            integrationProvider: 'ontology',
            inspectSchema: {},
            definitionSchema: {},
            instructions: 'Inspect real input',
            prepare,
            inspect
        },
        execute: jest.fn()
    })
)
beforeEach(async () => {
    jest.resetAllMocks()
    authorize.mockImplementation(async (input) => {
        if (input.userId !== id) throw new ForbiddenException()
        return actor
    })
    assistants.findOneBy.mockResolvedValue({ id, workspaceId: id })
    toolsets.find.mockResolvedValue([
        {
            id,
            name: 'Connection',
            schema: JSON.stringify({
                mcpServers: { sales: { url: 'secret-url', headers: { Authorization: 'secret' } } }
            })
        }
    ])
    integrations.find.mockResolvedValue([{ id, name: 'Ontology' }])
    access.mockResolvedValue({})
    prepare.mockResolvedValue({ generated: true })
    inspect.mockResolvedValue({ operations: [] })
    create.mockResolvedValue({ definition: { id, name: 'Sales' }, version: { id } })
    const module = await Test.createTestingModule({
        providers: [
            AnalyticsAuthoringService,
            { provide: AnalyticsDefinitionService, useValue: { authorize, create } },
            { provide: AnalyticsProviderRegistry, useValue: { list: () => providers } },
            { provide: XpertWorkspaceAccessService, useValue: { assertCanRead: access } },
            { provide: getRepositoryToken(Xpert), useValue: assistants },
            { provide: getRepositoryToken(XpertToolset), useValue: toolsets },
            { provide: getRepositoryToken(Integration), useValue: integrations }
        ]
    }).compile()
    service = module.get(AnalyticsAuthoringService)
})
it('lists four typed authoring routes without leaking URLs, credentials or configuration', async () => {
    const result = await service.catalog(scope)
    expect(result.map((item) => item.providerId)).toEqual(providers.map((item) => item.descriptor.id))
    expect(JSON.stringify(result)).not.toMatch(/secret|headers|options|url/)
    expect(integrations.find).toHaveBeenCalledWith(expect.objectContaining({ select: ['id', 'name'] }))
})
it('uses trusted context and a private immutable receipt for each provider', async () => {
    for (const selection of await service.catalog(scope)) {
        const { name, ...target } = selection
        await service.inspect(scope, target, {})
        const result = await service.register(scope, { ...target, requestId: 'sales', name: 'Sales', definition: {} })
        expect(result.source).toEqual({ kind: 'definition', definitionId: id, versionId: id })
        expect(result.discoveryRequest.source).toEqual(result.source)
        expect(prepare).toHaveBeenLastCalledWith(
            {},
            expect.objectContaining({ actor, workspaceId: id, xpertId: id, files: fileApi })
        )
        expect(create).toHaveBeenLastCalledWith(
            { providerId: target.providerId, name: 'Sales', visibility: 'private', options: { generated: true } },
            JSON.stringify([id, id, 'sales'])
        )
    }
})
it.each(['Connection', ''])('uses the runtime identity for an unnamed MCP server (%s)', async (name) => {
    toolsets.find.mockResolvedValue([{ id, name, schema: JSON.stringify({ mcpServers: { '': {} } }) }])
    const connection = (await service.catalog(scope)).find((item) => item.providerId === 'mcp-toolset')
    expect(connection.connectionKey).toBe(JSON.stringify([id, name || 'default']))
    await service.inspect(scope, { providerId: connection.providerId, connectionKey: connection.connectionKey }, {})
    expect(inspect).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
            connection: { kind: 'mcp-toolset', toolsetId: id, serverName: name || 'default' }
        })
    )
})
it('does not advertise MCP servers whose normalized identities collide', async () => {
    toolsets.find.mockResolvedValue([
        {
            id,
            name: 'same',
            schema: JSON.stringify({ servers: { '': {}, same: {} } })
        }
    ])
    expect((await service.catalog(scope)).some((item) => item.providerId === 'mcp-toolset')).toBe(false)
})
it('rejects forged actor/connection and untrusted top-level fields before a write', async () => {
    await expect(service.catalog({ ...scope, actor: { ...actor, userId: 'other' } })).rejects.toThrow()
    await expect(
        service.register(scope, {
            providerId: 'rest-toolset',
            connectionKey: 'other',
            requestId: 'r',
            name: 'Sales',
            definition: {}
        })
    ).rejects.toThrow()
    const input = {
        providerId: 'workspace-files',
        connectionKey: 'workspace',
        requestId: 'r',
        name: 'Sales',
        definition: {},
        workspaceId: 'other'
    }
    await expect(service.register(scope, input)).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
})
it('revalidates access after preflight and never persists failed or revoked inputs', async () => {
    const input = {
        providerId: 'workspace-files',
        connectionKey: 'workspace',
        requestId: 'r',
        name: 'Sales',
        definition: {}
    }
    prepare.mockRejectedValueOnce(new Error('invalid file mapping'))
    await expect(service.register(scope, input)).rejects.toThrow()
    prepare.mockImplementationOnce(async () => {
        assistants.findOneBy.mockResolvedValue(null)
        return {}
    })
    await expect(service.register(scope, input)).rejects.toThrow()
    expect(create).not.toHaveBeenCalled()
})
it('does not require authoring workspace access for file runtime ACLs', async () => {
    access.mockRejectedValue(new ForbiddenException())
    expect((await service.catalog(scope)).map((item) => item.providerId)).toEqual(['workspace-files', 'integration'])
    await service.inspect(scope, { providerId: 'workspace-files', connectionKey: 'workspace' }, {})
})
