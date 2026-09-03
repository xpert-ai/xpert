import {
    MCP_CAPABILITY_DESCRIPTOR_VERSION,
    XpertToolsetCategoryEnum,
    type IMcpConsumerServerCapabilities
} from '@xpert-ai/contracts'
import {
    defineMcpApp,
    defineMcpPrompt,
    defineMcpResource,
    defineMcpResourceTemplate,
    defineXpertTool
} from '@xpert-ai/plugin-sdk'
import { Test, type TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { McpConsumerCapabilitiesService } from '../mcp-consumer'
import { ToolRuntimeService } from '../tool-runtime'
import { XpertToolsetService } from '../xpert-toolset'
import { McpCapabilityCatalog } from './entities/mcp-capability-catalog.entity'
import { McpPublicationCapability } from './entities/mcp-publication-capability.entity'
import { McpCapabilityCatalogService } from './mcp-capability-catalog.service'
import { McpSubscriptionService } from './mcp-subscription.service'
import { z } from 'zod'

describe('McpCapabilityCatalogService', () => {
    let service: McpCapabilityCatalogService
    let discover: jest.Mock
    let findToolset: jest.Mock
    let loadToolsets: jest.Mock
    let save: jest.Mock

    beforeEach(async () => {
        jest.spyOn(RequestContext, 'getScope').mockReturnValue({
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        } as ReturnType<typeof RequestContext.getScope>)
        discover = jest.fn()
        findToolset = jest.fn()
        loadToolsets = jest.fn().mockResolvedValue([])
        save = jest.fn(async (_target, entities) => entities)
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                McpCapabilityCatalogService,
                {
                    provide: getRepositoryToken(McpCapabilityCatalog),
                    useValue: {
                        create: jest.fn((entity) => entity),
                        manager: {
                            transaction: jest.fn(async (operation) =>
                                operation({ delete: jest.fn().mockResolvedValue(undefined), save })
                            )
                        }
                    }
                },
                {
                    provide: getRepositoryToken(McpPublicationCapability),
                    useValue: { find: jest.fn().mockResolvedValue([]) }
                },
                { provide: McpSubscriptionService, useValue: { publishCatalogChanged: jest.fn() } },
                { provide: McpConsumerCapabilitiesService, useValue: { discover } },
                { provide: XpertToolsetService, useValue: { findOne: findToolset } },
                { provide: ToolRuntimeService, useValue: { loadToolsets } }
            ]
        }).compile()
        service = module.get(McpCapabilityCatalogService)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('imports an arbitrary configured MCP server without requiring a plugin fixture', async () => {
        discover.mockResolvedValue([externalServer()])
        findToolset.mockResolvedValue({
            id: 'toolset-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1'
        })

        const catalog = await service.discoverAndReplaceMcpToolset('toolset-1')

        expect(catalog).toHaveLength(5)
        const taskTool = catalog.find((entry) => entry.descriptor.source.remoteName === 'run/report')
        expect(taskTool?.descriptor).toEqual(
            expect.objectContaining({
                descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
                capabilityType: 'tool',
                taskMode: 'required',
                visibility: ['app'],
                behavior: {
                    risk: 'dangerous',
                    sideEffect: 'irreversible',
                    idempotency: 'non_idempotent'
                },
                providerInstructions: 'Use report resources before running a new report.',
                source: {
                    toolsetId: 'toolset-1',
                    serverName: 'third-party',
                    remoteName: 'run/report'
                }
            })
        )
        expect(taskTool?.descriptor.capabilityType).toBe('tool')
        if (taskTool?.descriptor.capabilityType !== 'tool') {
            throw new Error('Expected imported task tool descriptor')
        }
        expect(taskTool.descriptor.appResourceKey).toEqual(expect.any(String))
        expect(catalog.find((entry) => entry.descriptor.source.remoteName === 'ui://report')?.capabilityType).toBe(
            'app'
        )
        expect(
            catalog.find((entry) => entry.descriptor.source.remoteName === 'resource://reports/{reportId}')?.descriptor
        ).toEqual(expect.objectContaining({ mimeType: 'application/json' }))
        expect(save).toHaveBeenCalledWith(McpCapabilityCatalog, catalog)
    })

    it('keeps capability keys distinct when remote names normalize to the same text', async () => {
        const server = externalServer()
        server.tools = [
            { name: 'a/b', inputSchema: { type: 'object' } },
            { name: 'a?b', inputSchema: { type: 'object' } }
        ]
        server.apps = []
        server.resources = []
        server.resourceTemplates = []
        server.prompts = []
        discover.mockResolvedValue([server])
        findToolset.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1'
        })

        const catalog = await service.discoverAndReplaceMcpToolset('toolset-1')

        expect(new Set(catalog.map((entry) => entry.capabilityKey)).size).toBe(2)
        expect(catalog.every((entry) => entry.capabilityKey.length <= 191)).toBe(true)
    })

    it('imports native plugin declarations without requiring an MCP subprocess', async () => {
        const close = jest.fn().mockResolvedValue(undefined)
        const tool = defineXpertTool({
            name: 'search_documents',
            title: 'Search documents',
            description: 'Searches workspace documents',
            inputSchema: z.object({ query: z.string() }),
            outputSchema: z.object({ count: z.number() }),
            exposure: { mcp: { eligible: true } },
            behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
            requiredContext: ['workspace', 'principal', 'execution'],
            visibility: ['model', 'app'],
            app: { resourceKey: 'document_browser' },
            async execute() {
                return { structuredContent: { count: 1 } }
            }
        })
        const resource = defineMcpResource({
            key: 'document_overview',
            uri: 'xpert://documents/overview',
            mimeType: 'application/json',
            requiredContext: ['workspace'],
            async read() {
                return { contents: [{ uri: 'xpert://documents/overview', text: '{}' }] }
            }
        })
        const resourceTemplate = defineMcpResourceTemplate({
            key: 'document',
            uriTemplate: 'xpert://documents/{documentId}',
            mimeType: 'application/json',
            arguments: { documentId: { required: true, description: 'Document ID' } },
            async read({ documentId }) {
                return { contents: [{ uri: `xpert://documents/${documentId}`, text: documentId }] }
            },
            async complete() {
                return { values: [], hasMore: false }
            }
        })
        const prompt = defineMcpPrompt({
            key: 'review_document',
            name: 'review_document',
            arguments: { documentId: { required: true } },
            async get({ documentId }) {
                return { messages: [{ role: 'user', content: { type: 'text', text: documentId } }] }
            }
        })
        const app = defineMcpApp({
            key: 'document_browser',
            entry: 'apps/document-browser/index.html',
            csp: { connectDomains: ['https://api.example.test'] },
            permissions: { clipboardWrite: true }
        })
        findToolset.mockResolvedValue({
            id: 'toolset-1',
            category: XpertToolsetCategoryEnum.BUILTIN,
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            workspaceId: 'workspace-1'
        })
        loadToolsets.mockResolvedValue([
            {
                getMcpCapabilityDefinitions: () => ({
                    instructions: 'Prefer document resources before search tools.',
                    tools: [tool],
                    resources: [resource],
                    resourceTemplates: [resourceTemplate],
                    prompts: [prompt],
                    apps: [app]
                }),
                getMcpCapabilitySource: () => ({ pluginName: '@xpert-ai/plugin-documents' }),
                close
            }
        ])

        const catalog = await service.discoverAndReplaceMcpToolset('toolset-1')

        expect(discover).not.toHaveBeenCalled()
        expect(catalog).toHaveLength(5)
        expect(catalog.find(({ capabilityType }) => capabilityType === 'tool')?.descriptor).toEqual(
            expect.objectContaining({
                capabilityType: 'tool',
                capabilityKey: 'search_documents',
                inputSchema: expect.objectContaining({ type: 'object' }),
                outputSchema: expect.objectContaining({ type: 'object' }),
                behavior: { risk: 'read', sideEffect: 'none', idempotency: 'safe' },
                appResourceKey: 'document_browser',
                visibility: ['model', 'app'],
                providerInstructions: 'Prefer document resources before search tools.',
                source: {
                    toolsetId: 'toolset-1',
                    pluginName: '@xpert-ai/plugin-documents'
                }
            })
        )
        expect(catalog.find(({ capabilityType }) => capabilityType === 'resource')?.descriptor).toEqual(
            expect.objectContaining({
                capabilityKey: 'document_overview',
                uri: 'xpert://documents/overview',
                requiredContext: ['workspace']
            })
        )
        expect(catalog.find(({ capabilityType }) => capabilityType === 'resource_template')?.descriptor).toEqual(
            expect.objectContaining({
                capabilityKey: 'document',
                mimeType: 'application/json',
                supportsCompletion: true,
                argumentSchema: expect.objectContaining({ required: ['documentId'] })
            })
        )
        expect(catalog.find(({ capabilityType }) => capabilityType === 'prompt')?.descriptor).toEqual(
            expect.objectContaining({
                capabilityKey: 'review_document',
                name: 'review_document'
            })
        )
        expect(catalog.find(({ capabilityType }) => capabilityType === 'app')?.descriptor).toEqual(
            expect.objectContaining({
                capabilityKey: 'document_browser',
                entry: 'apps/document-browser/index.html',
                permissions: { clipboardWrite: true }
            })
        )
        expect(close).toHaveBeenCalledTimes(1)
    })

    it('rejects importing a toolset from another organization', async () => {
        discover.mockResolvedValue([externalServer()])
        findToolset.mockResolvedValue({
            tenantId: 'tenant-1',
            organizationId: 'organization-2',
            workspaceId: 'workspace-2'
        })

        await expect(service.discoverAndReplaceMcpToolset('toolset-1')).rejects.toBeInstanceOf(BadRequestException)
        expect(discover).not.toHaveBeenCalled()
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects duplicate capability bindings before replacing the catalog', async () => {
        const declaration = pluginAppDeclaration()

        await expect(
            service.replaceToolsetCapabilities({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                toolsetId: 'toolset-1',
                pluginName: '@xpert-ai/plugin-test',
                capabilities: [declaration, declaration]
            })
        ).rejects.toThrow("duplicate capability 'app:dashboard'")
        expect(save).not.toHaveBeenCalled()
    })

    it('rejects CSP directive injection and plugin bundle traversal at the catalog boundary', async () => {
        await expect(
            service.replaceToolsetCapabilities({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                toolsetId: 'toolset-1',
                pluginName: '@xpert-ai/plugin-test',
                capabilities: [
                    {
                        ...pluginAppDeclaration(),
                        csp: { connectDomains: ['https://api.example.test; script-src *'] }
                    }
                ]
            })
        ).rejects.toThrow('CSP domain')

        await expect(
            service.replaceToolsetCapabilities({
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                toolsetId: 'toolset-1',
                pluginName: '@xpert-ai/plugin-test',
                capabilities: [{ ...pluginAppDeclaration(), entry: '../outside.html' }]
            })
        ).rejects.toThrow('inside the plugin bundle')
        expect(save).not.toHaveBeenCalled()
    })
})

function pluginAppDeclaration() {
    return {
        descriptorVersion: MCP_CAPABILITY_DESCRIPTOR_VERSION,
        capabilityType: 'app' as const,
        capabilityKey: 'dashboard',
        entry: 'apps/dashboard.html',
        requiredContext: ['workspace' as const],
        visibility: ['app' as const]
    }
}

function externalServer(): IMcpConsumerServerCapabilities {
    return {
        serverName: 'third-party',
        instructions: 'Use report resources before running a new report.',
        tools: [
            {
                name: 'run/report',
                title: 'Run report',
                description: 'Runs a report',
                inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
                outputSchema: { type: 'object' },
                annotations: { readOnlyHint: true },
                taskSupport: 'required',
                visibility: ['app']
            }
        ],
        resources: [{ uri: 'resource://status', name: 'Status', mimeType: 'application/json' }],
        resourceTemplates: [
            {
                uriTemplate: 'resource://reports/{reportId}',
                name: 'Report',
                mimeType: 'application/json',
                argumentSchema: {
                    type: 'object',
                    properties: { reportId: { type: 'string' } },
                    required: ['reportId']
                }
            }
        ],
        prompts: [
            {
                name: 'summarize',
                argumentSchema: { type: 'object', properties: { topic: { type: 'string' } } }
            }
        ],
        apps: [{ toolName: 'run/report', resourceUri: 'ui://report', title: 'Report app' }],
        supportsCompletion: true
    }
}
