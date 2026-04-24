import { CommandBus } from '@nestjs/cqrs'

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

import { XpertService } from '../../xpert.service'
import { XpertDeleteCommand } from '../delete.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { XpertDeleteHandler } from './delete.handler'

describe('XpertDeleteHandler', () => {
    function createHandler(xpertOverrides: Record<string, unknown> = {}) {
        const xpert = {
            id: 'xpert-1',
            latest: false,
            publishAt: null,
            graph: {
                nodes: [],
                connections: []
            },
            ...xpertOverrides
        }

        const service = {
            findOne: jest.fn().mockResolvedValue(xpert),
            findAll: jest.fn().mockResolvedValue({ items: [] }),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
            repository: {
                remove: jest.fn().mockResolvedValue(undefined)
            }
        }
        const commandBus = {
            execute: jest.fn().mockResolvedValue(undefined)
        }

        return {
            handler: new XpertDeleteHandler(service as unknown as XpertService, commandBus as unknown as CommandBus),
            service,
            commandBus
        }
    }

    it('cleans published triggers before deleting the xpert', async () => {
        const graph = {
            nodes: [
                {
                    type: 'workflow',
                    entity: {
                        type: 'trigger',
                        from: 'wecom',
                        config: {
                            enabled: true,
                            integrationId: 'integration-1'
                        }
                    }
                }
            ],
            connections: []
        }
        const { handler, service, commandBus } = createHandler({
            graph,
            publishAt: new Date('2026-04-24T00:00:00.000Z')
        })

        await handler.execute(new XpertDeleteCommand('xpert-1'))

        expect(commandBus.execute).toHaveBeenCalledTimes(1)
        const [cleanupCommand] = commandBus.execute.mock.calls[0]
        expect(cleanupCommand).toBeInstanceOf(XpertPublishTriggersCommand)
        expect(cleanupCommand).toEqual(
            expect.objectContaining({
                xpert: expect.objectContaining({
                    id: 'xpert-1',
                    graph: {
                        nodes: [],
                        connections: []
                    }
                }),
                options: {
                    strict: false,
                    previousGraph: graph
                }
            })
        )
        expect(commandBus.execute.mock.invocationCallOrder[0]).toBeLessThan(service.delete.mock.invocationCallOrder[0])
    })

    it('skips trigger cleanup when the xpert graph is empty', async () => {
        const { handler, service, commandBus } = createHandler()

        await handler.execute(new XpertDeleteCommand('xpert-1'))

        expect(commandBus.execute).not.toHaveBeenCalled()
        expect(service.delete).toHaveBeenCalledWith('xpert-1')
    })
})
