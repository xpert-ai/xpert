import { instanceToPlain } from 'class-transformer'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { Test } from '@nestjs/testing'
import { AssistantBindingScope, AssistantCode, XpertWorkbenchInitialLayoutEnum } from '@xpert-ai/contracts'

jest.mock('@xpert-ai/server-core', () => ({ TransformInterceptor: class {}, Permissions: () => () => undefined }))
jest.mock('./assistant-binding.service', () => ({ AssistantBindingService: class {} }))

import { AssistantBindingController } from './assistant-binding.controller'
import { AssistantBindingService } from './assistant-binding.service'

describe('assistant binding catalog response', () => {
    beforeEach(() => jest.spyOn(RequestContext, 'hasPermission').mockReturnValue(true))
    afterEach(() => jest.restoreAllMocks())
    it.each(Object.values(AssistantBindingScope))('returns only catalog fields for %s scope', async (scope) => {
        const internal = 'internal-private-data'.repeat(10_000)
        const xpert = {
            id: 'assistant',
            slug: 'sales',
            name: 'Sales',
            latest: true,
            workspaceId: 'workspace',
            createdById: 'owner',
            starters: ['Use my data'],
            features: {
                opener: { enabled: true, message: 'Create a dashboard', questions: ['Try a demo'], internal },
                frequentQuestions: { enabled: true, internal },
                suggestion: { enabled: true, prompt: internal },
                textToSpeech: { enabled: true, copilotModel: { config: internal } }
            },
            businessAreaId: 'area',
            businessArea: { id: 'area', name: 'Sales', description: internal },
            tags: [{ id: 'tag', name: 'Sales', tenantId: internal }],
            workspace: {
                id: 'workspace',
                ownerId: 'owner',
                settings: { internal },
                members: [{ email: internal }],
                capabilities: { canRead: true, canRun: true, canWrite: false, canManage: false }
            },
            options: {
                workbench: {
                    initialLayout: XpertWorkbenchInitialLayoutEnum.TwoColumns,
                    defaultViewKey: 'orders',
                    internal
                },
                workspaceScope: {
                    mode: 'project-preferred',
                    onMissing: 'create',
                    projectType: { applicationKey: 'live-dashboard', projectTypeKey: 'dashboard', internal },
                    internal
                },
                templateSource: { manifest: internal },
                pendingPublication: internal
            },
            draft: internal,
            graph: internal,
            agent: { prompt: internal },
            copilotModel: { config: internal },
            userGroups: [{ users: [internal] }],
            unknownFutureField: internal
        }
        const service = {
            getAvailableXperts: jest.fn().mockResolvedValue([xpert])
        }
        const module = await Test.createTestingModule({
            controllers: [AssistantBindingController],
            providers: [{ provide: AssistantBindingService, useValue: service }]
        }).compile()
        const controller = module.get(AssistantBindingController)
        const result = instanceToPlain(await controller.getAvailableXperts(scope, AssistantCode.CLAWXPERT))
        const serialized = JSON.stringify(result)

        expect(service.getAvailableXperts).toHaveBeenCalledWith(scope, AssistantCode.CLAWXPERT)
        expect(serialized).not.toContain('internal-private-data')
        expect(serialized.length).toBeLessThan(1_500)
        expect(result).toEqual([
            expect.objectContaining({
                id: 'assistant',
                slug: 'sales',
                workspaceId: 'workspace',
                createdById: 'owner',
                latest: true,
                starters: ['Use my data'],
                features: {
                    opener: { enabled: true, message: 'Create a dashboard', questions: ['Try a demo'] },
                    frequentQuestions: { enabled: true }
                },
                businessArea: { id: 'area', name: 'Sales' },
                tags: [{ id: 'tag', name: 'Sales' }],
                workspace: {
                    id: 'workspace',
                    ownerId: 'owner',
                    capabilities: { canRead: true, canRun: true, canWrite: false, canManage: false }
                },
                options: {
                    workbench: { initialLayout: 'two-columns', defaultViewKey: 'orders' },
                    workspaceScope: {
                        mode: 'project-preferred',
                        onMissing: 'create',
                        projectType: { applicationKey: 'live-dashboard', projectTypeKey: 'dashboard' }
                    }
                }
            })
        ])
        expect(result[0]).not.toHaveProperty('draft')
        expect(result[0]).not.toHaveProperty('graph')
        expect(result[0]).not.toHaveProperty('copilotModel')
        await module.close()
    })
})
