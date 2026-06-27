import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { I18nService } from 'nestjs-i18n'
import { IBuiltinTool, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { XpertToolset } from './xpert-toolset.entity'
import { XpertToolsetService } from './xpert-toolset.service'

describe('XpertToolsetService', () => {
    it('hydrates persisted builtin tools with the latest provider schema', async () => {
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
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'ListBuiltinToolProvidersQuery') {
                    return [{ identity: { name: 'seedream_aigc', tags: [] } }]
                }
                if (query.constructor.name === 'ListBuiltinToolsQuery') {
                    return [latestTool]
                }
                return null
            })
        }
        const testingModule = await Test.createTestingModule({
            providers: [
                XpertToolsetService,
                {
                    provide: getRepositoryToken(XpertToolset),
                    useValue: {}
                },
                {
                    provide: XpertWorkspaceAccessService,
                    useValue: {}
                },
                {
                    provide: I18nService,
                    useValue: {}
                },
                {
                    provide: ConfigService,
                    useValue: {}
                },
                {
                    provide: ToolsetRegistry,
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
        const service = testingModule.get(XpertToolsetService)
        const toolset = Object.assign(new XpertToolset(), {
            category: XpertToolsetCategoryEnum.BUILTIN,
            type: 'seedream_aigc',
            tools: [
                Object.assign(new XpertTool(), {
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
                    }
                })
            ]
        })

        const [hydrated] = await service.afterLoad([toolset])

        expect(hydrated.tools[0]).toEqual(
            expect.objectContaining({
                name: 'seedream_text_to_image',
                disabled: false,
                description: 'Custom description',
                schema: latestSchema
            })
        )
    })
})
