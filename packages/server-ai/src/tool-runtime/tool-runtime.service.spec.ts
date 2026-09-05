import { Tool } from '@langchain/core/tools'
import { MCP_CAPABILITY_DESCRIPTOR_VERSION, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import {
    AnyXpertToolDefinition,
    DefaultRuntimeCapabilityRegistry,
    MANAGED_QUEUE_SERVICE_TOKEN,
    McpCapabilityRuntimeProvider,
    ToolExecutionContext,
    WorkspaceFilesRuntimeCapability,
    defineXpertTool,
    type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime/index'
import { BaseToolset } from '../xpert-toolset/toolset'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { McpCapabilityCatalog } from '../mcp-publication'
import { McpSubscriptionService } from '../mcp-publication/mcp-subscription.service'
import { ToolRuntimeService, normalizeToolResult } from './tool-runtime.service'
import { z } from 'zod'

describe('ToolRuntimeService', () => {
    let service: ToolRuntimeService
    let find: jest.Mock
    let findCapabilities: jest.Mock
    let commandExecute: jest.Mock
    let createScopedApi: jest.Mock
    let eventsApiForToolset: jest.Mock

    beforeEach(async () => {
        find = jest.fn().mockResolvedValue([])
        findCapabilities = jest.fn().mockResolvedValue([])
        commandExecute = jest.fn()
        createScopedApi = jest.fn().mockReturnValue({
            createModelClient: jest.fn(),
            getModelProvider: jest.fn()
        })
        eventsApiForToolset = jest.fn().mockReturnValue({ emit: jest.fn() })
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ToolRuntimeService,
                { provide: getRepositoryToken(XpertToolset), useValue: { find } },
                { provide: getRepositoryToken(McpCapabilityCatalog), useValue: { find: findCapabilities } },
                { provide: CommandBus, useValue: { execute: commandExecute } },
                { provide: QueryBus, useValue: { execute: jest.fn() } },
                {
                    provide: AgentMiddlewareRuntimeService,
                    useValue: { createScopedApi }
                },
                { provide: McpSubscriptionService, useValue: { eventsApiForToolset } },
                { provide: MANAGED_QUEUE_SERVICE_TOKEN, useValue: { enqueue: jest.fn() } }
            ]
        }).compile()
        service = module.get(ToolRuntimeService)
    })

    it('loads toolsets only from the explicit tenant and workspace scope', async () => {
        await service.loadToolsets({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            principal: { type: 'user', id: 'user-1', userId: 'user-1' },
            toolsetIds: ['toolset-1']
        })

        expect(find).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1'
            }),
            relations: ['tools']
        })
    })

    it('loads a trusted API preview snapshot without querying persisted toolsets', async () => {
        const runtime = new DeclaredTestToolset(declaredTool())
        commandExecute.mockResolvedValue(runtime)
        const snapshot = Object.assign(new XpertToolset(), {
            id: 'toolset-1',
            type: 'native-plugin',
            category: XpertToolsetCategoryEnum.BUILTIN,
            workspaceId: 'workspace-1'
        })

        await expect(
            service.loadToolsets({
                source: 'api',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: 'workspace-1',
                principal: { type: 'user', id: 'user-1', userId: 'user-1' },
                toolsetIds: ['toolset-1'],
                toolsetSnapshots: [snapshot]
            })
        ).resolves.toEqual([runtime])
        expect(find).not.toHaveBeenCalled()
        expect(commandExecute).toHaveBeenCalled()
    })

    it('rejects toolset snapshots outside the explicit API preview path', async () => {
        const snapshot = Object.assign(new XpertToolset(), {
            id: 'toolset-1',
            type: 'native-plugin',
            category: XpertToolsetCategoryEnum.BUILTIN,
            workspaceId: 'workspace-1'
        })

        await expect(
            service.loadToolsets({
                source: 'mcp',
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1',
                principal: { type: 'service_account', id: 'client-1' },
                toolsetIds: ['toolset-1'],
                toolsetSnapshots: [snapshot]
            })
        ).rejects.toThrow('restricted to the explicit API preview path')
        expect(find).not.toHaveBeenCalled()
    })

    it('does not publish legacy tools without a capability descriptor', async () => {
        await expect(
            service.describeCapabilities({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                toolsetIds: ['toolset-1']
            })
        ).resolves.toEqual([])
    })

    it('returns declared descriptors with the persisted toolset instance as source authority', async () => {
        findCapabilities.mockResolvedValue([
            {
                toolsetId: 'toolset-1',
                descriptor: {
                    descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                    capabilityType: 'tool',
                    capabilityKey: 'search',
                    source: { toolsetId: 'untrusted-toolset' },
                    requiredContext: ['workspace'],
                    visibility: ['model'],
                    inputSchema: { type: 'object' },
                    behavior: {
                        risk: 'read',
                        sideEffect: 'none',
                        idempotency: 'safe'
                    }
                }
            }
        ])

        const [descriptor] = await service.describeCapabilities({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            toolsetIds: ['toolset-1']
        })

        expect(descriptor.source.toolsetId).toBe('toolset-1')
    })

    it('passes the host-bound user-Xpert scope and scoped capability into legacy plugin toolsets', async () => {
        const runtime = new DeclaredTestToolset(declaredTool())
        const scopedFiles = {} as WorkspaceFilesApi
        const scopedCapabilities = new DefaultRuntimeCapabilityRegistry().register(
            WorkspaceFilesRuntimeCapability,
            scopedFiles
        )
        find.mockResolvedValue([
            Object.assign(new XpertToolset(), {
                id: 'toolset-1',
                type: 'native-plugin',
                category: XpertToolsetCategoryEnum.BUILTIN,
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1'
            })
        ])
        commandExecute.mockResolvedValue(runtime)
        createScopedApi.mockReturnValue({
            createModelClient: jest.fn(),
            getModelProvider: jest.fn(),
            capabilities: scopedCapabilities
        })

        await service.loadToolsets({
            source: 'agent',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1',
            principal: { type: 'user', id: 'user-a', userId: 'user-a' },
            toolsetIds: ['toolset-1'],
            xpertId: 'xpert-1',
            workspaceDataScope: 'user'
        })

        expect(createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'user-a',
                xpertId: 'xpert-1',
                catalog: 'user-xperts',
                scopeId: 'xpert-1',
                isolateByUser: true
            })
        )
        const params = commandExecute.mock.calls[0][0].params
        expect(params.runtimeScope).toEqual(
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'user-a',
                xpertId: 'xpert-1',
                catalog: 'user-xperts',
                scopeId: 'xpert-1',
                isolateByUser: true
            })
        )
        expect(params.runtimeCapabilities.get(WorkspaceFilesRuntimeCapability)).toBe(scopedFiles)
    })

    it('uses an explicit host file API and derives Project scope instead of trusting supplied fields', async () => {
        const runtime = new DeclaredTestToolset(declaredTool())
        const scopedFiles = {} as WorkspaceFilesApi
        const hostFiles = {} as WorkspaceFilesApi
        find.mockResolvedValue([
            Object.assign(new XpertToolset(), {
                id: 'toolset-1',
                type: 'native-plugin',
                category: XpertToolsetCategoryEnum.BUILTIN,
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1'
            })
        ])
        commandExecute.mockResolvedValue(runtime)
        createScopedApi.mockReturnValue({
            createModelClient: jest.fn(),
            getModelProvider: jest.fn(),
            capabilities: new DefaultRuntimeCapabilityRegistry().register(WorkspaceFilesRuntimeCapability, scopedFiles)
        })

        const request = {
            source: 'agent',
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            principal: { type: 'user', id: 'user-1', userId: 'user-1' },
            toolsetIds: ['toolset-1'],
            projectId: 'project-1',
            xpertId: 'xpert-1',
            workspaceDataScope: 'user',
            // These obsolete derived fields simulate an untyped/older caller.
            catalog: 'user-xperts',
            scopeId: 'forged-scope',
            isolateByUser: true,
            host: { files: hostFiles }
        } as Parameters<ToolRuntimeService['loadToolsets']>[0] & {
            catalog: 'user-xperts'
            scopeId: string
            isolateByUser: boolean
        }

        await service.loadToolsets(request)

        expect(createScopedApi.mock.calls[0][0]).toEqual(
            expect.objectContaining({
                projectId: 'project-1',
                xpertId: 'xpert-1',
                catalog: 'projects',
                scopeId: 'project-1',
                isolateByUser: false
            })
        )

        const params = commandExecute.mock.calls[0][0].params
        expect(params.runtimeCapabilities.get(WorkspaceFilesRuntimeCapability)).toBe(hostFiles)
        expect(params.runtimeScope).toEqual(
            expect.objectContaining({
                projectId: 'project-1',
                xpertId: 'xpert-1',
                catalog: 'projects',
                scopeId: 'project-1',
                isolateByUser: false
            })
        )
    })

    it('loads an organization-scoped native toolset without deriving a workspace for MCP publication calls', async () => {
        const runtime = new DeclaredTestToolset(declaredTool())
        find.mockResolvedValue([
            Object.assign(new XpertToolset(), {
                id: 'toolset-1',
                type: 'native-plugin',
                category: XpertToolsetCategoryEnum.BUILTIN,
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: null
            })
        ])
        commandExecute.mockResolvedValue(runtime)

        await expect(
            service.loadToolsets({
                source: 'mcp',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                principal: { type: 'service_account', id: 'publication-1' },
                toolsetIds: ['toolset-1']
            })
        ).resolves.toEqual([runtime])

        expect(find).toHaveBeenCalledWith({
            where: [
                expect.objectContaining({
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    workspaceId: expect.objectContaining({ _type: 'isNull' })
                }),
                expect.objectContaining({
                    tenantId: 'tenant-1',
                    organizationId: expect.objectContaining({ _type: 'isNull' }),
                    workspaceId: expect.objectContaining({ _type: 'isNull' })
                })
            ],
            relations: ['tools']
        })
        expect(createScopedApi).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: undefined }))
    })

    it('loads a tenant-scoped native toolset for an organization-bound MCP principal', async () => {
        const runtime = new DeclaredTestToolset(declaredTool())
        find.mockResolvedValue([
            Object.assign(new XpertToolset(), {
                id: 'toolset-1',
                type: 'native-plugin',
                category: XpertToolsetCategoryEnum.BUILTIN,
                tenantId: 'tenant-1',
                organizationId: null,
                workspaceId: null
            })
        ])
        commandExecute.mockResolvedValue(runtime)

        await expect(
            service.loadToolsets({
                source: 'mcp',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                principal: { type: 'user', id: 'user-1', userId: 'user-1' },
                toolsetIds: ['toolset-1']
            })
        ).resolves.toEqual([runtime])

        expect(find).toHaveBeenCalledWith({
            where: [
                expect.objectContaining({ organizationId: 'organization-1' }),
                expect.objectContaining({ organizationId: expect.objectContaining({ _type: 'isNull' }) })
            ],
            relations: ['tools']
        })
        expect(createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({ organizationId: 'organization-1', workspaceId: undefined })
        )
    })

    it('closes the toolset after a successful invocation and normalizes the result', async () => {
        const close = jest.fn().mockResolvedValue(undefined)
        const invoke = jest.fn().mockResolvedValue('done')
        const runtime = {
            initTools: jest.fn().mockResolvedValue(undefined),
            getTool: jest.fn().mockReturnValue({ invoke }),
            close
        } as unknown as BaseToolset<Tool>
        jest.spyOn(service, 'loadToolsets').mockResolvedValue([runtime])

        await expect(service.executeTool(executeRequest())).resolves.toEqual({
            content: [{ type: 'text', text: 'done' }]
        })
        expect(invoke).toHaveBeenCalledWith(
            { query: 'xpert' },
            expect.objectContaining({
                configurable: expect.objectContaining({
                    source: 'mcp',
                    workspaceId: 'workspace-1',
                    userId: 'user-1'
                })
            })
        )
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('closes the toolset when invocation fails', async () => {
        const close = jest.fn().mockResolvedValue(undefined)
        const runtime = {
            initTools: jest.fn().mockResolvedValue(undefined),
            getTool: jest.fn().mockReturnValue({ invoke: jest.fn().mockRejectedValue(new Error('failure')) }),
            close
        } as unknown as BaseToolset<Tool>
        jest.spyOn(service, 'loadToolsets').mockResolvedValue([runtime])

        await expect(service.executeTool(executeRequest())).rejects.toThrow('failure')
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('executes a declared native plugin tool through the same explicit runtime context', async () => {
        const execute = jest.fn(async (_input: { query: string }, context: ToolExecutionContext) => ({
            content: [{ type: 'text' as const, text: `${context.source}:${context.workspaceId}` }],
            structuredContent: { count: 1 }
        }))
        const definition = defineXpertTool({
            name: 'search',
            description: 'Search documents',
            inputSchema: z.object({ query: z.string() }),
            outputSchema: z.object({ count: z.number() }),
            exposure: { mcp: { eligible: true } },
            behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
            requiredContext: ['workspace', 'principal', 'execution'],
            execute
        })
        const close = jest.fn().mockResolvedValue(undefined)
        const runtime = {
            initTools: jest.fn().mockResolvedValue([]),
            getMcpCapabilityDefinitions: jest.fn().mockReturnValue({ tools: [definition] }),
            getName: jest.fn().mockReturnValue('Documents'),
            close
        } as unknown as BaseToolset<Tool>
        jest.spyOn(service, 'loadToolsets').mockResolvedValue([runtime])

        await expect(service.executeTool(executeRequest())).resolves.toEqual({
            content: [{ type: 'text', text: 'mcp:workspace-1' }],
            structuredContent: { count: 1 }
        })
        expect(execute).toHaveBeenCalledWith(
            { query: 'xpert' },
            expect.objectContaining({
                source: 'mcp',
                workspaceId: 'workspace-1',
                requestId: 'request-1'
            })
        )
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('adapts the same declared tool for Agent execution with an explicit host context', async () => {
        const workspaceFiles = { readBuffer: jest.fn() }
        const events = { emit: jest.fn() }
        eventsApiForToolset.mockReturnValue(events)
        const execute = jest.fn(async (_input: { query: string }, context: ToolExecutionContext) => ({
            content: [{ type: 'text' as const, text: `${context.source}:${context.requestId}` }]
        }))
        const definition = defineXpertTool({
            name: 'native_search',
            description: 'Search documents',
            inputSchema: z.object({ query: z.string() }),
            exposure: { mcp: { eligible: true } },
            behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
            requiredContext: ['workspace', 'principal', 'execution'],
            execute
        })
        const runtime = new DeclaredTestToolset(definition)
        find.mockResolvedValue([
            Object.assign(new XpertToolset(), {
                id: 'toolset-1',
                type: 'native-plugin',
                category: XpertToolsetCategoryEnum.BUILTIN,
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1',
                credentials: { apiKey: 'toolset-secret', nested: { region: 'cn' } }
            })
        ])
        commandExecute.mockResolvedValue(runtime)
        createScopedApi.mockReturnValue({
            createModelClient: jest.fn(),
            getModelProvider: jest.fn(),
            capabilities: { get: jest.fn().mockReturnValue(workspaceFiles) }
        })

        const [loaded] = await service.loadToolsets({
            source: 'agent',
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            principal: { type: 'user', id: 'user-1', userId: 'user-1' },
            toolsetIds: ['toolset-1'],
            xpertId: 'xpert-1',
            workspaceDataScope: 'shared',
            executionId: 'execution-1'
        })
        const tools = await loaded.initTools()
        await tools[0].invoke({ query: 'xpert' }, { configurable: { tool_call_id: 'agent-tool-call-1' } })

        expect(execute).toHaveBeenCalledWith(
            { query: 'xpert' },
            expect.objectContaining({
                source: 'agent',
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1',
                executionId: 'execution-1',
                requestId: 'agent-tool-call-1',
                host: expect.objectContaining({ events, files: workspaceFiles, models: expect.any(Object) })
            })
        )
        expect(eventsApiForToolset).toHaveBeenCalledWith('toolset-1', undefined)
        const context = execute.mock.calls[0][1]
        await expect(context.host.credentials?.get('apiKey')).resolves.toBe('toolset-secret')
        await expect(context.host.credentials?.get('nested')).resolves.toEqual({ region: 'cn' })
        await expect(context.host.credentials?.get('missing')).resolves.toBeNull()
    })

    it('does not expose workspace files when execution has no Project or Xpert binding', async () => {
        const scopedFiles = {} as WorkspaceFilesApi
        const hostFiles = {} as WorkspaceFilesApi
        const execute = jest.fn(async (_input: unknown, _context: ToolExecutionContext) => ({
            content: [{ type: 'text' as const, text: 'done' }]
        }))
        const runtime = new DeclaredTestToolset(
            defineXpertTool({
                name: 'native_search',
                description: 'Search documents',
                inputSchema: z.object({ query: z.string() }),
                exposure: { mcp: { eligible: true } },
                behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
                requiredContext: ['workspace'],
                execute
            })
        )
        find.mockResolvedValue([
            Object.assign(new XpertToolset(), {
                id: 'toolset-1',
                type: 'native-plugin',
                category: XpertToolsetCategoryEnum.BUILTIN,
                tenantId: 'tenant-1',
                workspaceId: 'workspace-1'
            })
        ])
        commandExecute.mockResolvedValue(runtime)
        createScopedApi.mockReturnValue({
            createModelClient: jest.fn(),
            getModelProvider: jest.fn(),
            capabilities: new DefaultRuntimeCapabilityRegistry().register(WorkspaceFilesRuntimeCapability, scopedFiles)
        })

        const [loaded] = await service.loadToolsets({
            source: 'agent',
            tenantId: 'tenant-1',
            workspaceId: 'workspace-1',
            principal: { type: 'user', id: 'user-1', userId: 'user-1' },
            toolsetIds: ['toolset-1'],
            executionId: 'execution-1',
            host: { files: hostFiles }
        })
        const params = commandExecute.mock.calls[0][0].params
        expect(params.runtimeCapabilities?.get(WorkspaceFilesRuntimeCapability)).toBeUndefined()

        const tools = await loaded.initTools()
        await tools[0].invoke({ query: 'xpert' }, { configurable: { tool_call_id: 'agent-tool-call-1' } })

        expect(execute.mock.calls[0][1].host).not.toHaveProperty('files')
    })
})

describe('normalizeToolResult', () => {
    it('preserves structured MCP-compatible results', () => {
        expect(
            normalizeToolResult({
                content: [{ type: 'text', text: 'summary' }],
                structuredContent: { count: 1 }
            })
        ).toEqual({
            content: [{ type: 'text', text: 'summary' }],
            structuredContent: { count: 1 }
        })
    })
})

function executeRequest() {
    return {
        source: 'mcp' as const,
        principal: { type: 'user' as const, id: 'user-1', userId: 'user-1' },
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        workspaceId: 'workspace-1',
        toolsetId: 'toolset-1',
        toolName: 'search',
        arguments: { query: 'xpert' },
        executionId: 'execution-1',
        requestId: 'request-1'
    }
}

function declaredTool() {
    return defineXpertTool({
        name: 'native_search',
        description: 'Search documents',
        inputSchema: z.object({ query: z.string() }),
        exposure: { mcp: { eligible: true } },
        behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
        requiredContext: ['workspace'],
        async execute() {
            return { content: [{ type: 'text' as const, text: 'done' }] }
        }
    })
}

class DeclaredTestToolset extends BaseToolset<Tool> implements McpCapabilityRuntimeProvider {
    providerName = 'native-plugin'
    providerType = XpertToolsetCategoryEnum.BUILTIN
    tools: Tool[] = []

    constructor(private readonly definition: AnyXpertToolDefinition) {
        super()
    }

    getId() {
        return 'toolset-1'
    }

    getName() {
        return 'Native plugin'
    }

    getToolTitle(name: string) {
        return name
    }

    getMcpCapabilityDefinitions() {
        return { tools: [this.definition] }
    }
}
