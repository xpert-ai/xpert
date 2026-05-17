import { Test, TestingModule } from '@nestjs/testing'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ToolsetGetToolsHandler } from './get-tools.handler'
import { XpertToolsetService } from '../../xpert-toolset.service'
import { ToolsetGetToolsCommand } from '../get-tools.command'
import { In } from 'typeorm'

describe('ToolsetGetToolsHandler', () => {
    let handler: ToolsetGetToolsHandler
    let findAll: jest.Mock

    beforeEach(async () => {
        findAll = jest.fn().mockResolvedValue({ items: [] })
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
                    useValue: {}
                },
                {
                    provide: QueryBus,
                    useValue: {}
                }
            ]
        }).compile()

        handler = module.get<ToolsetGetToolsHandler>(ToolsetGetToolsHandler)
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
    })
})
