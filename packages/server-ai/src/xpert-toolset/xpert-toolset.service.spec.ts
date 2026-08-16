jest.mock('./provider/builtin', () => ({
    createBuiltinToolset: jest.fn()
}))

import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Test } from '@nestjs/testing'
import { I18nService } from 'nestjs-i18n'
import { IBuiltinTool, XpertToolsetCategoryEnum } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/server-core'
import { ToolsetRegistry } from '@xpert-ai/plugin-sdk'
import { AgentMiddlewareRuntimeService } from '../shared/agent/middleware-runtime.service'
import { XpertWorkspaceAccessService } from '../xpert-workspace'
import { XpertTool } from '../xpert-tool/xpert-tool.entity'
import { createBuiltinToolset } from './provider/builtin'
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
                },
                {
                    provide: AgentMiddlewareRuntimeService,
                    useValue: { createScopedApi: jest.fn() }
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

    it('validates a builtin toolset with the current model provider runtime', async () => {
        const getModelProvider = jest.fn()
        const createModelClient = jest.fn()
        const createScopedApi = jest.fn().mockReturnValue({ createModelClient, getModelProvider })
        const validateCredentials = jest.fn().mockResolvedValue(undefined)
        jest.mocked(createBuiltinToolset).mockResolvedValue({ validateCredentials } as never)
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')

        const queryBus = {
            execute: jest.fn(async (query) => {
                if (query.constructor.name === 'ListBuiltinToolProvidersQuery') {
                    return [
                        {
                            identity: {
                                name: 'zhipu_cogvideo',
                                author: 'XpertAI Team',
                                description: { en_US: 'Zhipu CogVideo' },
                                icon: 'icon.svg',
                                label: { en_US: 'Zhipu CogVideo' },
                                tags: []
                            }
                        }
                    ]
                }
                return {}
            })
        }
        const testingModule = await Test.createTestingModule({
            providers: [
                XpertToolsetService,
                { provide: getRepositoryToken(XpertToolset), useValue: {} },
                { provide: XpertWorkspaceAccessService, useValue: {} },
                { provide: I18nService, useValue: {} },
                { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('http://localhost/') } },
                { provide: ToolsetRegistry, useValue: {} },
                { provide: CommandBus, useValue: {} },
                { provide: QueryBus, useValue: queryBus },
                { provide: AgentMiddlewareRuntimeService, useValue: { createScopedApi } }
            ]
        }).compile()
        const service = testingModule.get(XpertToolsetService)
        jest.spyOn(service, 'create').mockResolvedValue({ id: 'toolset-1' } as XpertToolset)

        await service.createBuiltinToolset('zhipu_cogvideo', { credentials: {} })

        expect(createScopedApi).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })
        expect(createBuiltinToolset).toHaveBeenCalledWith(
            'zhipu_cogvideo',
            null,
            expect.objectContaining({
                modelRuntime: { createModelClient, getModelProvider }
            })
        )
        expect(validateCredentials).toHaveBeenCalledWith({})
    })
})
