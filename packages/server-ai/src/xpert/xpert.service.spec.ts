import { XpertPublishCommand } from './commands'
import { XpertService } from './xpert.service'
import { DEFAULT_MEMORY_PROVIDER_NAME } from '../xpert-memory'
import { WorkflowNodeTypeEnum } from '@metad/contracts'

describe('XpertService command facade', () => {
    function createService() {
        const repository = {
            findOne: jest.fn(),
            save: jest.fn(),
            find: jest.fn(),
            findOneBy: jest.fn(),
            count: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue({
                innerJoin: jest.fn().mockReturnThis(),
                where: jest.fn().mockReturnThis(),
                select: jest.fn().mockReturnThis(),
                getMany: jest.fn().mockResolvedValue([]),
                leftJoinAndSelect: jest.fn().mockReturnThis(),
                addOrderBy: jest.fn().mockReturnThis(),
                take: jest.fn().mockReturnThis()
            })
        }
        const userService = {
            findAll: jest.fn(),
            findOne: jest.fn()
        }
        const commandBus = { execute: jest.fn().mockResolvedValue(undefined) }
        const queryBus = { execute: jest.fn() }
        const eventEmitter = { emitAsync: jest.fn() }
        const triggerRegistry = { get: jest.fn(), list: jest.fn().mockReturnValue([]) }
        const sandboxService = { listProviders: jest.fn().mockReturnValue([]) }
        const agentMiddlewareRegistry = { get: jest.fn() }
        const xpertMemoryProvider = {
            list: jest.fn(),
            search: jest.fn(),
            get: jest.fn(),
            upsert: jest.fn(),
            bulkUpsert: jest.fn(),
            archiveAll: jest.fn(),
            resolveScope: jest.fn(),
            toApiRecord: jest.fn((value) => value)
        }
        const memoryRegistry = {
            getProviderOrThrow: jest.fn().mockReturnValue(xpertMemoryProvider)
        }

        const service = new XpertService(
            repository as any,
            userService as any,
            commandBus as any,
            queryBus as any,
            eventEmitter as any,
            triggerRegistry as any,
            sandboxService as any,
            memoryRegistry as any,
            agentMiddlewareRegistry as any
        )

        return {
            service,
            commandBus,
            triggerRegistry,
            repository,
            memoryRegistry,
            agentMiddlewareRegistry,
            xpertMemoryProvider
        }
    }

    it('publish forwards to XpertPublishCommand', async () => {
        const { service, commandBus } = createService()

        await service.publish('xpert-1', true, 'env-1', 'release note')

        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        const [command] = commandBus.execute.mock.calls[0]
        expect(command).toBeInstanceOf(XpertPublishCommand)
        expect(command).toEqual(
            expect.objectContaining({
                id: 'xpert-1',
                newVersion: true,
                environmentId: 'env-1',
                notes: 'release note'
            })
        )
    })

    it('getTriggerProviders returns providers meta from trigger registry', async () => {
        const { service, triggerRegistry } = createService()
        triggerRegistry.list.mockReturnValue([
            {
                meta: {
                    name: 'lark'
                }
            },
            {
                meta: {
                    name: 'schedule'
                }
            }
        ])

        const providers = await service.getTriggerProviders()

        expect(providers).toEqual([
            {
                name: 'lark'
            },
            {
                name: 'schedule'
            }
        ])
    })

    it('resolves the active middleware provider for memory listing', async () => {
        const { service, repository, memoryRegistry, agentMiddlewareRegistry, xpertMemoryProvider } = createService()
        repository.findOne.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            graph: {
                nodes: [
                    {
                        key: 'agent-1',
                        type: 'agent'
                    },
                    {
                        key: 'memory-1',
                        type: 'middleware',
                        entity: {
                            type: WorkflowNodeTypeEnum.MIDDLEWARE,
                            provider: 'FileMemorySystemMiddleware',
                            options: {
                                providerName: 'custom-memory'
                            }
                        }
                    }
                ],
                connections: [
                    {
                        type: 'workflow',
                        from: 'agent-1',
                        to: 'memory-1'
                    }
                ]
            },
            agent: {
                key: 'agent-1'
            }
        })
        agentMiddlewareRegistry.get.mockReturnValue({
            meta: {
                exclusiveCategory: 'memory'
            }
        })
        xpertMemoryProvider.list.mockResolvedValue([])
        xpertMemoryProvider.resolveScope.mockReturnValue({
            scopeType: 'xpert',
            scopeId: 'xpert-1'
        })

        await service.findAllMemory('xpert-1', [])

        expect(memoryRegistry.getProviderOrThrow).toHaveBeenCalledWith('custom-memory')
    })

    it('falls back to the default provider when no active memory middleware is configured', async () => {
        const { service, repository, memoryRegistry, xpertMemoryProvider } = createService()
        repository.findOne.mockResolvedValue({
            id: 'xpert-1',
            tenantId: 'tenant-1',
            graph: {
                nodes: [],
                connections: []
            },
            agent: {
                key: 'agent-1'
            }
        })
        xpertMemoryProvider.list.mockResolvedValue([])
        xpertMemoryProvider.resolveScope.mockReturnValue({
            scopeType: 'xpert',
            scopeId: 'xpert-1'
        })

        await service.findAllMemory('xpert-1', [])

        expect(memoryRegistry.getProviderOrThrow).toHaveBeenCalledWith(DEFAULT_MEMORY_PROVIDER_NAME)
    })
})
