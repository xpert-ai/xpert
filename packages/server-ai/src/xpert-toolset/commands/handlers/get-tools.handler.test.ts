import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ToolsetGetToolsHandler } from './get-tools.handler'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { In } from 'typeorm'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { MANAGED_QUEUE_SERVICE_TOKEN } from '@xpert-ai/plugin-sdk'
import { CreateToolsetCommand } from '../create-toolset.command'

describe('ToolsetGetToolsHandler', () => {
    let handler: ToolsetGetToolsHandler
    let findAll: jest.Mock
    let createScopedApi: jest.Mock
    let getModelProvider: jest.Mock
    let executeCommand: jest.Mock

    beforeEach(async () => {
        jest.spyOn(AsyncLocalStorageProviderSingleton, 'getRunnableConfig').mockReturnValue(undefined)
        findAll = jest.fn().mockResolvedValue({ items: [] })
        getModelProvider = jest.fn().mockResolvedValue({
            providerScopeId: 'provider-1',
            copilotId: 'copilot-1',
            organizationId: 'org-1',
            provider: 'zhipuai',
            baseURL: 'https://zhipu.example',
            authorization: 'Bearer provider-key',
            reportUsage: jest.fn()
        })
        createScopedApi = jest.fn().mockReturnValue({ createModelClient: jest.fn(), getModelProvider })
        executeCommand = jest.fn()
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                ToolsetGetToolsHandler,
                {
                    provide: XpertToolsetService,
                    useValue: {
                        findAll
                    }
                },
                {
                    provide: CommandBus,
                    useValue: { execute: executeCommand }
                },
                {
                    provide: QueryBus,
                    useValue: {}
                },
                {
                    provide: AgentMiddlewareRuntimeService,
                    useValue: { createScopedApi }
                },
                { provide: MANAGED_QUEUE_SERVICE_TOKEN, useValue: { enqueue: jest.fn() } }
            ]
        }).compile()

        handler = module.get<ToolsetGetToolsHandler>(ToolsetGetToolsHandler)
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('should be defined', () => {
        expect(handler).toBeDefined()
    })

    it('should call toolsetService.findAll with correct parameters', async () => {
        const ids = ['1', '2']
        const command = new ToolsetGetToolsCommand(ids)
        await handler.execute(command)
        expect(findAll).toHaveBeenCalledWith({
            where: {
                id: In(ids)
            },
            relations: ['tools']
        })
    })

    it('should include workspace scope when workspaceId is provided', async () => {
        const ids = ['1', '2']
        const command = new ToolsetGetToolsCommand(ids, {
            workspaceId: 'workspace-1'
        })
        await handler.execute(command)
        expect(findAll).toHaveBeenCalledWith({
            where: {
                id: In(ids),
                workspaceId: 'workspace-1'
            },
            relations: ['tools']
        })
        expect(createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                workspaceId: 'workspace-1'
            })
        )
    })

    it('binds one execution to the tool host usage callbacks', async () => {
        await handler.execute(new ToolsetGetToolsCommand(['1'], { executionId: 'execution-1' }))

        expect(createScopedApi).toHaveBeenCalledWith(
            expect.objectContaining({
                executionId: 'execution-1',
                usageCallback: expect.any(Function)
            })
        )

        const usageCallback = createScopedApi.mock.calls[0][0].usageCallback
        jest.spyOn(AsyncLocalStorageProviderSingleton, 'getRunnableConfig').mockReturnValue({
            configurable: { executionId: 'runtime-execution-1' }
        })
        await usageCallback({ totalTokens: 12 })

        expect(executeCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                executionId: 'execution-1',
                usage: expect.objectContaining({ tokens: 12 })
            })
        )
    })

    it('resolves the execution id when a reusable graph reports usage', async () => {
        let executionId = 'execution-1'
        await handler.execute(
            new ToolsetGetToolsCommand(['1'], {
                getExecutionId: () => executionId
            })
        )
        executionId = 'execution-2'

        const usageCallback = createScopedApi.mock.calls[0][0].usageCallback
        await usageCallback({ totalTokens: 12 })

        expect(executeCommand).toHaveBeenCalledWith(
            expect.objectContaining({
                executionId: 'execution-2',
                usage: expect.objectContaining({ tokens: 12 })
            })
        )
    })

    it('shares the resolved model provider reporter with each Toolset', async () => {
        findAll.mockResolvedValue({
            items: [
                { id: 'toolset-1', type: 'video-a', category: 'builtin' },
                { id: 'toolset-2', type: 'video-b', category: 'builtin' }
            ]
        })
        executeCommand.mockResolvedValue({})
        await handler.execute(new ToolsetGetToolsCommand(['toolset-1', 'toolset-2'], { executionId: 'execution-1' }))

        const createToolsets = executeCommand.mock.calls
            .map(([created]) => created)
            .filter((created) => created instanceof CreateToolsetCommand) as CreateToolsetCommand[]
        await Promise.all(createToolsets.map((created) => created.params.modelRuntime.getModelProvider('zhipuai')))

        expect(getModelProvider).toHaveBeenCalledTimes(2)
    })

    it('binds Provider-backed usage reporting to the resolved model provider scope', async () => {
        findAll.mockResolvedValue({
            items: [{ id: 'toolset-1', type: 'zhipu_cogvideo', category: 'builtin' }]
        })
        executeCommand.mockResolvedValue({})

        await handler.execute(new ToolsetGetToolsCommand(['toolset-1'], { executionId: 'execution-1' }))

        const createToolset = executeCommand.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof CreateToolsetCommand) as CreateToolsetCommand
        const provider = await createToolset.params.modelRuntime.getModelProvider('zhipuai')

        expect(getModelProvider).toHaveBeenCalledWith('zhipuai')
        expect(provider.providerScopeId).toBe('provider-1')
        expect(provider.reportUsage).toEqual(expect.any(Function))
    })
})
