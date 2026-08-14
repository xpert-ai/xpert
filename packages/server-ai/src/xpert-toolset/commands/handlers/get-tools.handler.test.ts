import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ToolsetGetToolsHandler } from './get-tools.handler'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { In } from 'typeorm'
import { AgentMiddlewareRuntimeService } from '../../../shared/agent/middleware-runtime.service'
import { AsyncLocalStorageProviderSingleton } from '@langchain/core/singletons'

describe('ToolsetGetToolsHandler', () => {
    let handler: ToolsetGetToolsHandler
    let findAll: jest.Mock
    let createScopedApi: jest.Mock
    let executeCommand: jest.Mock

    beforeEach(async () => {
        jest.spyOn(AsyncLocalStorageProviderSingleton, 'getRunnableConfig').mockReturnValue(undefined)
        findAll = jest.fn().mockResolvedValue({ items: [] })
        createScopedApi = jest.fn().mockReturnValue({ createModelClient: jest.fn() })
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
                executionId: undefined,
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
})
