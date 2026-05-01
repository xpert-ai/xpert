import { CommandBus } from '@nestjs/cqrs'

jest.mock('../../xpert.service', () => ({
    XpertService: class XpertService {}
}))

jest.mock('../../../xpert-template/xpert-template.service', () => ({
    XpertTemplateService: class XpertTemplateService {}
}))

import { XpertService } from '../../xpert.service'
import { XpertTemplateService } from '../../../xpert-template/xpert-template.service'
import { XpertDeleteCommand } from '../delete.command'
import { XpertPublishTriggersCommand } from '../publish-triggers.command'
import { XpertDeleteHandler } from './delete.handler'

describe('XpertDeleteHandler', () => {
    type TTestExportedTemplate = {
        id: string
        filePath: string
    }

    type TTestXpertOverrides = Partial<{
        latest: boolean
        publishAt: Date | null
        graph: {
            nodes: unknown[]
            connections: unknown[]
        }
        exportedTemplate: TTestExportedTemplate
        type: string
        slug: string
    }>

    function createHandler(xpertOverrides: TTestXpertOverrides = {}) {
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
        const xpertTemplateService = {
            deleteExportedXpertTemplate: jest.fn().mockResolvedValue(undefined)
        }

        return {
            handler: new XpertDeleteHandler(
                service as unknown as XpertService,
                commandBus as unknown as CommandBus,
                xpertTemplateService as unknown as XpertTemplateService
            ),
            service,
            commandBus,
            xpertTemplateService
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

    it('deletes the exported template before deleting the xpert', async () => {
        const exportedTemplate = {
            id: 'xpert-xpert-1',
            filePath: 'templates/xpert-xpert-1.yaml'
        }
        const { handler, service, xpertTemplateService } = createHandler({ exportedTemplate })

        await handler.execute(new XpertDeleteCommand('xpert-1'))

        expect(xpertTemplateService.deleteExportedXpertTemplate).toHaveBeenCalledWith(exportedTemplate)
        expect(xpertTemplateService.deleteExportedXpertTemplate.mock.invocationCallOrder[0]).toBeLessThan(
            service.delete.mock.invocationCallOrder[0]
        )
    })

    it('cleans exported templates for all versions before removing old versions', async () => {
        const latestTemplate = {
            id: 'xpert-latest',
            filePath: 'templates/xpert-latest.yaml'
        }
        const oldTemplate = {
            id: 'xpert-old',
            filePath: 'templates/xpert-old.yaml'
        }
        const { handler, service, xpertTemplateService } = createHandler({
            latest: true,
            type: 'agent',
            slug: 'support',
            exportedTemplate: latestTemplate
        })
        service.findAll.mockResolvedValue({
            items: [
                {
                    id: 'xpert-old',
                    exportedTemplate: oldTemplate
                }
            ]
        })

        await handler.execute(new XpertDeleteCommand('xpert-1'))

        expect(xpertTemplateService.deleteExportedXpertTemplate).toHaveBeenCalledWith(latestTemplate)
        expect(xpertTemplateService.deleteExportedXpertTemplate).toHaveBeenCalledWith(oldTemplate)
        expect(xpertTemplateService.deleteExportedXpertTemplate.mock.invocationCallOrder[1]).toBeLessThan(
            service.repository.remove.mock.invocationCallOrder[0]
        )
    })
})
