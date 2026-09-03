import {
    AiModelTypeEnum,
    AiProviderRole,
    ModelFeature,
    PLUGIN_APPLICATION_INSTALLATION_STATUS,
    RolesEnum
} from '@xpert-ai/contracts'
import { SYSTEM_GLOBAL_SCOPE } from '@xpert-ai/plugin-sdk'
import { RequestContext } from '@xpert-ai/server-core'
import { NotFoundException } from '@nestjs/common'
import { PluginApplicationInstallation } from './plugin-application-installation.entity'
import { PluginApplicationService } from './plugin-application.service'
import { CopilotOneByRoleQuery, FindCopilotModelsQuery } from '../copilot/queries'

describe('PluginApplicationService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    function createService(
        contents: unknown[],
        scopeKey = SYSTEM_GLOBAL_SCOPE,
        queryBus: object = {},
        marketplace: object = {}
    ) {
        return new PluginApplicationService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            queryBus as never,
            [
                {
                    name: '@acme/plugin-example-app',
                    packageName: '@acme/plugin-example-app@0.2.2',
                    scopeKey,
                    instance: {
                        meta: {
                            name: '@acme/plugin-example-app',
                            version: '0.2.2',
                            targetAppMeta: {
                                xpert: { marketplace: { ...marketplace, contents } }
                            }
                        }
                    }
                }
            ] as never
        )
    }

    it('resolves App initialization only from a trusted loaded contribution with explicit template linkage', () => {
        const service = createService([
            {
                type: 'assistant-template',
                name: 'example-assistant',
                displayName: 'Example Assistant'
            },
            {
                type: 'app',
                name: 'example-app',
                displayName: 'Example App',
                appConfig: {
                    scope: 'organization',
                    assistantTemplateKey: 'example-assistant',
                    workspace: {
                        mode: 'dedicated',
                        name: 'Example App Workspace',
                        sharing: 'organization'
                    }
                }
            }
        ])

        expect(service['resolveApplication']('@acme/plugin-example-app', 'example-app')).toMatchObject({
            pluginVersion: '0.2.2',
            templateId: '@acme/plugin-example-app:example-assistant',
            templateVersion: '0.2.2',
            application: {
                id: '@acme/plugin-example-app:example-app',
                scope: 'organization',
                assistantTemplateKey: 'example-assistant'
            }
        })
    })

    it('returns trusted App configuration, marketplace metadata and scoped status in the catalog', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(null)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        const service = createService(
            [
                {
                    type: 'app',
                    name: 'example-app',
                    displayName: 'Example App',
                    tags: ['business-operations', 'multi-agent'],
                    appConfig: {
                        scope: 'organization',
                        assistantTemplateKey: 'example-assistant',
                        workspace: {
                            mode: 'dedicated',
                            name: 'Example App Workspace',
                            sharing: 'organization'
                        }
                    }
                }
            ],
            SYSTEM_GLOBAL_SCOPE,
            {},
            {
                category: 'business-operations',
                subcategory: 'factory',
                featured: true,
                updatedAt: '2026-08-30T00:00:00.000Z'
            }
        )

        await expect(service.getCatalog()).resolves.toEqual([
            expect.objectContaining({
                application: expect.objectContaining({
                    id: '@acme/plugin-example-app:example-app',
                    assistantTemplateKey: 'example-assistant'
                }),
                marketplace: {
                    category: 'business-operations',
                    subcategory: 'factory',
                    featured: true,
                    tags: ['business-operations', 'multi-agent'],
                    updatedAt: '2026-08-30T00:00:00.000Z'
                },
                status: expect.objectContaining({
                    appId: '@acme/plugin-example-app:example-app',
                    status: 'not_installed',
                    initializationAccess: 'organization_required'
                })
            })
        ])
    })

    it('does not infer an App configuration from names or an Assistant template alone', () => {
        const service = createService([
            {
                type: 'assistant-template',
                name: 'example-assistant',
                displayName: 'Example Assistant'
            },
            {
                type: 'app',
                name: 'example-app',
                displayName: 'Example App'
            }
        ])

        expect(() => service['resolveApplication']('@acme/plugin-example-app', 'example-app')).toThrow(
            NotFoundException
        )
    })

    it('does not resolve an App contribution loaded for another organization', () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const service = createService(
            [
                {
                    type: 'app',
                    name: 'example-app',
                    appConfig: {
                        scope: 'organization',
                        assistantTemplateKey: 'example-assistant',
                        workspace: { mode: 'dedicated', name: 'Example App Workspace', sharing: 'organization' }
                    }
                }
            ],
            'org-2'
        )

        expect(() => service['resolveApplication']('@acme/plugin-example-app', 'example-app')).toThrow(
            NotFoundException
        )
    })

    it('does not enumerate organization models for a role that cannot initialize Apps', async () => {
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.VIEWER } } as never)
        const service = createService([
            {
                type: 'app',
                name: 'example-app',
                appConfig: {
                    scope: 'organization',
                    assistantTemplateKey: 'example-assistant',
                    workspace: {
                        mode: 'dedicated',
                        name: 'Example App Workspace',
                        sharing: 'organization'
                    },
                    modelRequirements: { embedding: true, vision: true }
                }
            }
        ])
        const application = service['resolveApplication']('@acme/plugin-example-app', 'example-app').application

        await expect(service['getPreflightForApplication'](application)).resolves.toMatchObject({
            canInitialize: false,
            reason: 'role_required',
            embeddingModels: [],
            visionModels: []
        })
    })

    it('returns organization role defaults independently from provider catalog order', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as never)
        const queryBus = {
            execute: jest.fn(async (query: FindCopilotModelsQuery | CopilotOneByRoleQuery) => {
                if (query instanceof FindCopilotModelsQuery) {
                    if (query.type === AiModelTypeEnum.TEXT_EMBEDDING) {
                        return [
                            {
                                id: 'embedding-copilot',
                                providerWithModels: {
                                    models: [
                                        {
                                            model: 'multimodal-embedding-v1',
                                            label: 'Multimodal Embedding',
                                            model_type: AiModelTypeEnum.TEXT_EMBEDDING
                                        },
                                        {
                                            model: 'text-embedding-v4',
                                            label: 'Text Embedding v4',
                                            model_type: AiModelTypeEnum.TEXT_EMBEDDING
                                        }
                                    ]
                                }
                            }
                        ]
                    }
                    return [
                        {
                            id: 'primary-copilot',
                            providerWithModels: {
                                models: [
                                    {
                                        model: 'qwen-plus',
                                        label: 'Qwen Plus',
                                        model_type: AiModelTypeEnum.LLM,
                                        features: []
                                    },
                                    {
                                        model: 'qwen-vl-plus',
                                        label: 'Qwen VL Plus',
                                        model_type: AiModelTypeEnum.LLM,
                                        features: [ModelFeature.VISION]
                                    }
                                ]
                            }
                        }
                    ]
                }
                if (query.role === AiProviderRole.Embedding) {
                    return {
                        id: 'embedding-copilot',
                        copilotModel: { model: 'text-embedding-v4', modelType: AiModelTypeEnum.TEXT_EMBEDDING }
                    }
                }
                return {
                    id: 'primary-copilot',
                    copilotModel: { model: 'qwen-vl-plus', modelType: AiModelTypeEnum.LLM }
                }
            })
        }
        const service = createService(
            [
                {
                    type: 'app',
                    name: 'example-app',
                    appConfig: {
                        scope: 'organization',
                        assistantTemplateKey: 'example-assistant',
                        workspace: { mode: 'dedicated', name: 'Example App Workspace', sharing: 'organization' },
                        modelRequirements: { primary: true, embedding: true, vision: true }
                    }
                }
            ],
            SYSTEM_GLOBAL_SCOPE,
            queryBus
        )
        const application = service['resolveApplication']('@acme/plugin-example-app', 'example-app').application

        await expect(service['getPreflightForApplication'](application)).resolves.toMatchObject({
            canInitialize: true,
            defaultEmbeddingModelId: 'embedding-copilot/text-embedding-v4',
            defaultVisionModelId: 'primary-copilot/qwen-vl-plus',
            embeddingModels: [
                { id: 'embedding-copilot/multimodal-embedding-v1' },
                { id: 'embedding-copilot/text-embedding-v4' }
            ],
            visionModels: [{ id: 'primary-copilot/qwen-vl-plus' }]
        })
    })

    it('uses the server-authorized organization default when initialization omits a model id', async () => {
        const queryBus = {
            execute: jest.fn(async (query: FindCopilotModelsQuery) => {
                if (query.type !== AiModelTypeEnum.TEXT_EMBEDDING) return []
                return [
                    {
                        id: 'embedding-copilot',
                        providerWithModels: {
                            models: [
                                {
                                    model: 'text-embedding-v4',
                                    label: 'Text Embedding v4',
                                    model_type: AiModelTypeEnum.TEXT_EMBEDDING
                                }
                            ]
                        }
                    }
                ]
            })
        }
        const service = createService([], SYSTEM_GLOBAL_SCOPE, queryBus)

        await expect(
            service['resolveRequiredModel'](
                undefined,
                AiModelTypeEnum.TEXT_EMBEDDING,
                undefined,
                'embedding-copilot/text-embedding-v4'
            )
        ).resolves.toMatchObject({
            config: {
                copilotId: 'embedding-copilot',
                model: 'text-embedding-v4',
                modelType: AiModelTypeEnum.TEXT_EMBEDDING
            }
        })
    })

    it('returns a healthy ready installation without requiring models again', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as never)

        const installation = Object.assign(new PluginApplicationInstallation(), {
            id: 'installation-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            pluginName: '@acme/plugin-example-app',
            appName: 'example-app',
            declaredScope: 'organization',
            scopeKey: 'org-1',
            status: PLUGIN_APPLICATION_INSTALLATION_STATUS.READY,
            workspaceId: 'workspace-1',
            xpertId: 'xpert-1',
            knowledgebaseIds: []
        })
        const installationRepo = {
            findOne: jest.fn().mockResolvedValue(installation),
            save: jest.fn()
        }
        const workspaceRepo = { exists: jest.fn().mockResolvedValue(true) }
        const knowledgebaseRepo = { exists: jest.fn().mockResolvedValue(true) }
        const xpertRepo = {
            exists: jest.fn().mockResolvedValue(true),
            findOne: jest.fn().mockResolvedValue({ id: 'xpert-1', slug: 'example-app' })
        }
        const queryBus = { execute: jest.fn() }
        const service = new PluginApplicationService(
            installationRepo as never,
            workspaceRepo as never,
            knowledgebaseRepo as never,
            xpertRepo as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            queryBus as never,
            [
                {
                    name: '@acme/plugin-example-app',
                    packageName: '@acme/plugin-example-app@0.2.2',
                    scopeKey: SYSTEM_GLOBAL_SCOPE,
                    instance: {
                        meta: {
                            name: '@acme/plugin-example-app',
                            version: '0.2.2',
                            targetAppMeta: {
                                xpert: {
                                    marketplace: {
                                        contents: [
                                            {
                                                type: 'app',
                                                name: 'example-app',
                                                appConfig: {
                                                    scope: 'organization',
                                                    assistantTemplateKey: 'example-assistant',
                                                    workspace: {
                                                        mode: 'dedicated',
                                                        name: 'Example App Workspace',
                                                        sharing: 'organization'
                                                    },
                                                    modelRequirements: { embedding: true, vision: true }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            ] as never
        )

        await expect(
            service.initialize({
                pluginName: '@acme/plugin-example-app',
                appName: 'example-app',
                operationId: 'retry-1'
            })
        ).resolves.toMatchObject({ status: 'ready', assistantSlug: 'example-app' })
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(installationRepo.save).not.toHaveBeenCalled()
    })

    it('repairs a degraded installation without duplicating its healthy Assistant', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ role: { name: RolesEnum.ADMIN } } as never)

        const degraded = Object.assign(new PluginApplicationInstallation(), {
            id: 'installation-1',
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            pluginName: '@acme/plugin-example-app',
            appName: 'example-app',
            declaredScope: 'organization',
            scopeKey: 'org-1',
            status: PLUGIN_APPLICATION_INSTALLATION_STATUS.DEGRADED,
            workspaceId: 'workspace-1',
            xpertId: 'xpert-1',
            knowledgebaseIds: []
        })
        const claimed = Object.assign(new PluginApplicationInstallation(), {
            ...degraded,
            status: PLUGIN_APPLICATION_INSTALLATION_STATUS.INITIALIZING
        })
        const installationRepo = {
            findOne: jest
                .fn()
                .mockResolvedValueOnce(degraded)
                .mockResolvedValueOnce(degraded)
                .mockResolvedValueOnce(claimed),
            update: jest.fn().mockResolvedValue({ affected: 1 }),
            save: jest.fn(async (value) => value)
        }
        const commandBus = { execute: jest.fn() }
        const service = new PluginApplicationService(
            installationRepo as never,
            { findOne: jest.fn().mockResolvedValue({ id: 'workspace-1' }) } as never,
            {} as never,
            {
                findOne: jest.fn().mockResolvedValue({ id: 'xpert-1', slug: 'example-app' })
            } as never,
            {} as never,
            {} as never,
            {} as never,
            commandBus as never,
            { execute: jest.fn() } as never,
            [
                {
                    name: '@acme/plugin-example-app',
                    packageName: '@acme/plugin-example-app@0.2.2',
                    scopeKey: SYSTEM_GLOBAL_SCOPE,
                    instance: {
                        meta: {
                            name: '@acme/plugin-example-app',
                            version: '0.2.2',
                            targetAppMeta: {
                                xpert: {
                                    marketplace: {
                                        contents: [
                                            {
                                                type: 'app',
                                                name: 'example-app',
                                                appConfig: {
                                                    scope: 'organization',
                                                    assistantTemplateKey: 'example-assistant',
                                                    workspace: {
                                                        mode: 'dedicated',
                                                        name: 'Example App Workspace',
                                                        sharing: 'organization'
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                }
                            }
                        }
                    }
                }
            ] as never
        )

        await expect(
            service.initialize({
                pluginName: '@acme/plugin-example-app',
                appName: 'example-app',
                operationId: 'repair-1'
            })
        ).resolves.toMatchObject({ status: 'ready', xpertId: 'xpert-1', assistantSlug: 'example-app' })
        expect(commandBus.execute).not.toHaveBeenCalled()
    })
})
