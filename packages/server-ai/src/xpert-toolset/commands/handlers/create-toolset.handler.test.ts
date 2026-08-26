import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { TBuiltinToolsetParams, ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { CreateToolsetCommand } from '../create-toolset.command'
import { XpertToolset } from '../../xpert-toolset.entity'
import { CreateToolsetHandler } from './create-toolset.handler'

describe('CreateToolsetHandler', () => {
    it('passes runtime params to plugin toolset strategies', async () => {
        const createdToolset = {}
        const strategy = {
            create: jest.fn().mockResolvedValue(createdToolset)
        }
        const testingModule = await Test.createTestingModule({
            providers: [
                CreateToolsetHandler,
                {
                    provide: CommandBus,
                    useValue: {}
                },
                {
                    provide: QueryBus,
                    useValue: {}
                },
                {
                    provide: ToolsetRegistry,
                    useValue: {
                        get: jest.fn().mockReturnValue(strategy),
                        getSource: jest.fn().mockReturnValue({
                            kind: 'plugin',
                            pluginName: '@xpert-ai/plugin-seedream',
                            pluginVersion: '2.1.0',
                            scopeKey: 'organization-1'
                        })
                    }
                }
            ]
        }).compile()
        const handler = testingModule.get(CreateToolsetHandler)
        const commandBus = testingModule.get(CommandBus)
        const queryBus = testingModule.get(QueryBus)
        const toolset = Object.assign(new XpertToolset(), { type: 'seedream_aigc' })
        const params: TBuiltinToolsetParams = {
            tenantId: 'tenant-1',
            xpertId: 'xpert-1',
            env: {},
            commandBus,
            queryBus
        }

        const result = await handler.execute(new CreateToolsetCommand(toolset, params))

        expect(result).toBe(createdToolset)
        expect(strategy.create).toHaveBeenCalledWith(toolset, {
            ...params,
            pluginScopeKey: 'organization-1',
            pluginName: '@xpert-ai/plugin-seedream',
            pluginVersion: '2.1.0'
        })
    })
})
