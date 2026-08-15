import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ToolsetGetToolsHandler } from './get-tools.handler'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { In } from 'typeorm'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'
import { ModelInvocationService } from '../../../model-invocation'
import { CreateToolsetCommand } from '../create-toolset.command'

describe('ToolsetGetToolsHandler', () => {
    let handler: ToolsetGetToolsHandler
    let findAll: jest.Mock
    let createScopedApi: jest.Mock
    let getModelProvider: jest.Mock
    let executeCommand: jest.Mock
    let createInvocationRecorder: jest.Mock

    beforeEach(async () => {
        jest.spyOn(AsyncLocalStorageProviderSingleton, 'getRunnableConfig').mockReturnValue(undefined)
        findAll = jest.fn().mockResolvedValue({ items: [] })
        getModelProvider = jest.fn().mockResolvedValue({
            providerScopeId: 'provider-1',
            copilotId: 'copilot-1',
            organizationId: 'org-1',
            provider: 'zhipuai',
            baseURL: 'https://zhipu.example',
            authorization: 'Bearer provider-key'
        })
        createScopedApi = jest.fn().mockReturnValue({ createModelClient: jest.fn(), getModelProvider })
        executeCommand = jest.fn()
        createInvocationRecorder = jest.fn().mockReturnValue(jest.fn())
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
                {
                    provide: ModelInvocationService,
                    useValue: { createRecorder: createInvocationRecorder }
                }
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
        const execution = { id: 'execution-1', tokens: 0 }
        await handler.execute(new ToolsetGetToolsCommand(['1'], { execution }))

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

        expect(executeCommand).toHaveBeenCalledWith(expect.objectContaining({ executionId: 'execution-1', tokens: 12 }))
    })

    it('binds a separate invocation recorder when each Toolset resolves its model provider', async () => {
        findAll.mockResolvedValue({
            items: [
                { id: 'toolset-1', type: 'video-a', category: 'builtin' },
                { id: 'toolset-2', type: 'video-b', category: 'builtin' }
            ]
        })
        executeCommand.mockResolvedValue({})
        const execution = { id: 'execution-1', tokens: 0 }

        await handler.execute(new ToolsetGetToolsCommand(['toolset-1', 'toolset-2'], { execution }))

        const createToolsets = executeCommand.mock.calls
            .map(([created]) => created)
            .filter((created) => created instanceof CreateToolsetCommand) as CreateToolsetCommand[]
        await Promise.all(createToolsets.map((created) => created.params.modelRuntime.getModelProvider('zhipuai')))

        expect(createInvocationRecorder).toHaveBeenCalledTimes(2)
        expect(createInvocationRecorder).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({ toolsetId: 'toolset-1', providerScopeId: 'provider-1' })
        )
        expect(createInvocationRecorder).toHaveBeenNthCalledWith(
            2,
            expect.objectContaining({ toolsetId: 'toolset-2', providerScopeId: 'provider-1' })
        )
        expect(createInvocationRecorder.mock.calls[0][0].resolveOrigin()).toEqual({
            type: 'execution',
            id: 'execution-1',
            executionId: 'execution-1'
        })
    })

    it('binds Provider-backed invocation recording to the resolved model provider scope', async () => {
        findAll.mockResolvedValue({
            items: [{ id: 'toolset-1', type: 'zhipu_cogvideo', category: 'builtin' }]
        })
        executeCommand.mockResolvedValue({})

        await handler.execute(
            new ToolsetGetToolsCommand(['toolset-1'], { execution: { id: 'execution-1', tokens: 0 } })
        )

        const createToolset = executeCommand.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof CreateToolsetCommand) as CreateToolsetCommand
        const provider = await createToolset.params.modelRuntime.getModelProvider('zhipuai')

        expect(getModelProvider).toHaveBeenCalledWith('zhipuai')
        expect(provider.providerScopeId).toBe('provider-1')
        expect(provider.recordInvocation).toEqual(expect.any(Function))
        expect(createInvocationRecorder).toHaveBeenLastCalledWith(
            expect.objectContaining({ toolsetId: 'toolset-1', providerScopeId: 'provider-1' })
        )
    })
})
