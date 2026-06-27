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
            execute: jest.fn(async () => [
                latestTool
            ])
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
})
