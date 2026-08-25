import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { IBuiltinTool, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { XpertToolsetService } from '../xpert-toolset'
import { XpertToolset } from '../xpert-toolset/xpert-toolset.entity'
import { XpertTool } from './xpert-tool.entity'
import { XpertToolService } from './xpert-tool.service'

describe('XpertToolService', () => {
    it('hydrates a persisted builtin tool with the latest provider schema', async () => {
        const latestSchema = {
            type: 'object',
            properties: {
                prompt: {
                    type: 'string',
                    'x-ui': {
                        title: {
                            en_US: 'Prompt',
                            zh_Hans: '提示词'
                        }
                    }
                }
            }
        }
        const latestTool: IBuiltinTool = {
            identity: {
                name: 'seedream_text_to_image',
                author: 'yu rongku',
                label: {
                    en_US: 'Seedream text to image'
                },
                provider: 'seedream_aigc'
            },
            description: {
                human: {
                    en_US: 'Generate an image.'
                },
                llm: 'Generate an image.'
            },
            schema: latestSchema
        }
        const queryBus = {
            execute: jest.fn(async () => [latestTool])
        }
        const testingModule = await Test.createTestingModule({
            providers: [
                XpertToolService,
                {
                    provide: getRepositoryToken(XpertTool),
                    useValue: {}
                },
                {
                    provide: XpertToolsetService,
                    useValue: {}
                },
                {
                    provide: CommandBus,
                    useValue: {}
                },
                {
                    provide: QueryBus,
                    useValue: queryBus
                }
            ]
        }).compile()
        const service = testingModule.get(XpertToolService)
        const persistedTool = Object.assign(new XpertTool(), {
            id: 'tool-id',
            name: 'seedream_text_to_image',
            disabled: false,
            description: 'Custom description',
            schema: {
                type: 'object',
                properties: {
                    sequential_image_generation: {
                        type: 'string'
                    }
                }
            },
            toolset: {
                category: XpertToolsetCategoryEnum.BUILTIN,
                type: 'seedream_aigc'
            }
        })
        persistedTool.toolset = Object.assign(new XpertToolset(), persistedTool.toolset)
        jest.spyOn(service, 'findOne').mockResolvedValue(persistedTool)

        const tool = await service.getTool('tool-id')

        expect(tool).toEqual(
            expect.objectContaining({
                name: 'seedream_text_to_image',
                disabled: false,
                description: 'Custom description',
                schema: latestSchema,
                provider: expect.objectContaining({
                    schema: latestSchema
                })
            })
        )
    })

    it.each([false, true])('closes the runtime after parameter schema inspection (fails=%s)', async (fails) => {
        const close = jest.fn().mockResolvedValue(undefined)
        const runtime = {
            initTools: fails ? jest.fn().mockRejectedValue(new Error('schema failure')) : jest.fn(),
            getTool: jest.fn().mockReturnValue({
                lc_kwargs: { schema: { type: 'object', properties: { query: { type: 'string' } } } }
            }),
            close
        }
        const commandBus = { execute: jest.fn().mockResolvedValue([runtime]) }
        const testingModule = await Test.createTestingModule({
            providers: [
                XpertToolService,
                { provide: getRepositoryToken(XpertTool), useValue: {} },
                { provide: XpertToolsetService, useValue: {} },
                { provide: CommandBus, useValue: commandBus },
                { provide: QueryBus, useValue: { execute: jest.fn() } }
            ]
        }).compile()
        const service = testingModule.get(XpertToolService)
        jest.spyOn(service, 'getTool').mockResolvedValue(
            Object.assign(new XpertTool(), {
                id: 'tool-id',
                name: 'search',
                toolsetId: 'toolset-1',
                toolset: Object.assign(new XpertToolset(), { workspaceId: 'workspace-1' })
            })
        )

        if (fails) {
            await expect(service.getParamsFaker('tool-id')).rejects.toThrow('schema failure')
        } else {
            await expect(service.getParamsFaker('tool-id')).resolves.toEqual(expect.any(Object))
        }
        expect(close).toHaveBeenCalledTimes(1)
    })
})
