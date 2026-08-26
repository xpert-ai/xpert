import { ToolParameterForm, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { BadRequestException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { ToolRuntimeService } from '../../../tool-runtime'
import { ToolInvokeCommand } from '../tool-invoke.command'
import { ToolInvokeHandler } from './tool-invoke.handler'

describe('ToolInvokeHandler', () => {
    let handler: ToolInvokeHandler
    let queryExecute: jest.Mock
    let executeTool: jest.Mock

    beforeEach(async () => {
        queryExecute = jest.fn().mockResolvedValue({ API_HOST: 'https://api.example.test' })
        executeTool = jest.fn().mockResolvedValue({ content: [{ type: 'text', text: 'done' }] })
        const module = await Test.createTestingModule({
            providers: [
                ToolInvokeHandler,
                { provide: QueryBus, useValue: { execute: queryExecute } },
                { provide: ToolRuntimeService, useValue: { executeTool } }
            ]
        }).compile()
        handler = module.get(ToolInvokeHandler)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1' } as never)
    })

    afterEach(() => jest.restoreAllMocks())

    it.each([
        [XpertToolsetCategoryEnum.BUILTIN, 'native-plugin'],
        [XpertToolsetCategoryEnum.API, 'openapi'],
        [XpertToolsetCategoryEnum.MCP, 'mcp']
    ])('delegates %s preview execution to the shared runtime', async (category, type) => {
        const result = await handler.execute(
            new ToolInvokeCommand({
                name: 'search',
                schema: {
                    parameters: [{ name: 'query', form: ToolParameterForm.LLM, schema: { type: 'string' } }]
                },
                parameters: { query: 'xpert' },
                toolset: {
                    id: 'toolset-1',
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    workspaceId: 'workspace-1',
                    name: 'Search',
                    type,
                    category
                }
            })
        )

        expect(result).toEqual({ content: [{ type: 'text', text: 'done' }] })
        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'api',
                tenantId: 'tenant-1',
                organizationId: 'organization-1',
                workspaceId: 'workspace-1',
                toolsetId: 'toolset-1',
                toolName: 'search',
                principal: { type: 'user', id: 'user-1', userId: 'user-1' },
                arguments: { query: 'xpert' },
                executionId: expect.any(String),
                requestId: expect.any(String),
                env: { API_HOST: 'https://api.example.test' },
                configurable: expect.objectContaining({ subscriber: expect.any(Object) }),
                toolsetSnapshots: [
                    expect.objectContaining({
                        id: 'toolset-1',
                        category,
                        type,
                        tools: [expect.objectContaining({ name: 'search', enabled: true })]
                    })
                ]
            })
        )
    })

    it('keeps form parameters in explicit runtime context and converts LLM parameter values', async () => {
        await handler.execute(
            new ToolInvokeCommand({
                name: 'generate',
                schema: {
                    parameters: [
                        { name: 'limit', form: ToolParameterForm.LLM, schema: { type: 'number' } },
                        { name: 'xpertId', form: ToolParameterForm.FORM, schema: { type: 'string' } },
                        { name: 'agentKey', form: ToolParameterForm.FORM, schema: { type: 'string' } }
                    ]
                },
                parameters: { limit: '3', xpertId: 'xpert-1', agentKey: 'agent-1' },
                toolset: {
                    workspaceId: 'workspace-1',
                    name: 'Generate',
                    type: 'native-plugin',
                    category: XpertToolsetCategoryEnum.BUILTIN
                }
            })
        )

        expect(executeTool).toHaveBeenCalledWith(
            expect.objectContaining({
                toolsetId: expect.any(String),
                arguments: { limit: 3 },
                xpertId: 'xpert-1',
                agentKey: 'agent-1'
            })
        )
    })

    it('returns legacy subscriber events together with the normalized runtime result', async () => {
        executeTool.mockImplementation(async (request) => {
            request.configurable.subscriber.next({ type: 'progress', value: 1 })
            return { structuredContent: { ok: true } }
        })

        await expect(handler.execute(new ToolInvokeCommand(previewTool()))).resolves.toEqual({
            events: [{ type: 'progress', value: 1 }],
            result: { structuredContent: { ok: true } }
        })
    })

    it('rejects preview execution without an explicit workspace', async () => {
        await expect(
            handler.execute(
                new ToolInvokeCommand({
                    name: 'search',
                    toolset: {
                        name: 'Search',
                        type: 'native-plugin',
                        category: XpertToolsetCategoryEnum.BUILTIN
                    }
                })
            )
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(executeTool).not.toHaveBeenCalled()
    })
})

function previewTool() {
    return {
        name: 'generate',
        schema: { parameters: [] },
        parameters: {},
        toolset: {
            id: 'toolset-1',
            workspaceId: 'workspace-1',
            name: 'Generate',
            type: 'native-plugin',
            category: XpertToolsetCategoryEnum.BUILTIN
        }
    }
}
