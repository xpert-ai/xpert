import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { RuntimeCapabilitiesService } from '../ai/runtime-capabilities.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { Xpert } from './xpert.entity'
import { XpertProfileIdentityService } from './xpert-profile-identity.service'
import { XpertProfileIndicatorsService } from './xpert-profile-indicators.service'

describe('XpertProfileIndicatorsService', () => {
    afterEach(() => {
        jest.useRealTimers()
        jest.restoreAllMocks()
    })

    it('summarizes accessible Workspace skills, deduplicated Tools, all direct sub-agents and 30-day conversations', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-04T00:00:00.000Z'))
        const count = jest.fn().mockResolvedValue(11)
        const conversations = Object.assign(Object.create(Repository.prototype), {
            count
        }) as Repository<ChatConversation>
        const identity = Object.assign(Object.create(XpertProfileIdentityService.prototype), {
            resolve: jest.fn().mockResolvedValue({
                instanceId: 'assistant-v2',
                currentId: 'assistant-v2',
                versionIds: ['assistant-v1', 'assistant-v2']
            })
        }) as XpertProfileIdentityService
        const runtimeCapabilities = Object.assign(Object.create(RuntimeCapabilitiesService.prototype), {
            countAccessibleWorkspaceSkills: jest.fn().mockResolvedValue(2)
        }) as RuntimeCapabilitiesService
        const middlewareRegistry = Object.assign(Object.create(AgentMiddlewareRegistry.prototype), {
            get: jest.fn().mockReturnValue({ getToolNames: () => ['shared-tool', 'middleware-tool', 'disabled-tool'] })
        }) as AgentMiddlewareRegistry
        const service = new XpertProfileIndicatorsService(
            conversations,
            identity,
            runtimeCapabilities,
            middlewareRegistry
        )
        const xpert = Object.assign(new Xpert(), {
            id: 'assistant-v2',
            tenantId: 'tenant-a',
            organizationId: 'org-a',
            agent: { key: 'primary' },
            graph: {
                nodes: [
                    {
                        type: 'agent',
                        key: 'primary',
                        position: { x: 0, y: 0 },
                        entity: {
                            key: 'primary',
                            options: { availableTools: { operations: ['shared-tool'] } }
                        }
                    },
                    {
                        type: 'toolset',
                        key: 'tools',
                        position: { x: 0, y: 0 },
                        entity: {
                            id: 'tools',
                            name: 'operations',
                            tools: [
                                { id: 'tool-a', name: 'shared-tool' },
                                { id: 'tool-b', name: 'not-allowed' }
                            ]
                        }
                    },
                    {
                        type: 'workflow',
                        key: 'middleware',
                        position: { x: 0, y: 0 },
                        entity: {
                            id: 'middleware',
                            key: 'middleware',
                            type: WorkflowNodeTypeEnum.MIDDLEWARE,
                            provider: 'OperationsMiddleware',
                            tools: { 'disabled-tool': false }
                        }
                    },
                    {
                        type: 'agent',
                        key: 'worker',
                        position: { x: 0, y: 0 },
                        entity: { key: 'worker' }
                    },
                    {
                        type: 'xpert',
                        key: 'external',
                        position: { x: 0, y: 0 },
                        entity: { id: 'external', name: 'External' }
                    }
                ],
                connections: [
                    { key: 'primary/tools', type: 'toolset', from: 'primary', to: 'tools' },
                    { key: 'primary/middleware', type: 'workflow', from: 'primary', to: 'middleware' },
                    { key: 'primary/worker', type: 'agent', from: 'primary', to: 'worker' },
                    { key: 'primary/external', type: 'xpert', from: 'primary', to: 'external', required: true }
                ]
            }
        })

        await expect(service.getIndicators(xpert)).resolves.toEqual({
            skillCount: 2,
            toolCount: 2,
            subAgentCount: 2,
            conversationCount30d: 11
        })
        expect(runtimeCapabilities.countAccessibleWorkspaceSkills).toHaveBeenCalledWith(xpert, 'assistant-v2')
        expect(conversations.count).toHaveBeenCalledWith({
            where: expect.objectContaining({
                tenantId: 'tenant-a',
                organizationId: 'org-a'
            })
        })
        const where = count.mock.calls[0][0].where
        expect(where.createdAt.value).toEqual(new Date('2026-08-05T00:00:00.000Z'))
        expect(where.xpertId.value).toEqual(['assistant-v1', 'assistant-v2'])
    })

    it('keeps structural indicators available when optional activity sources fail', async () => {
        jest.spyOn(console, 'warn').mockImplementation()
        const conversations = Object.assign(Object.create(Repository.prototype), {
            count: jest.fn().mockRejectedValue(new Error('database unavailable'))
        }) as Repository<ChatConversation>
        const identity = Object.assign(Object.create(XpertProfileIdentityService.prototype), {
            resolve: jest
                .fn()
                .mockResolvedValue({ instanceId: 'assistant', currentId: 'assistant', versionIds: ['assistant'] })
        }) as XpertProfileIdentityService
        const runtimeCapabilities = Object.assign(Object.create(RuntimeCapabilitiesService.prototype), {
            countAccessibleWorkspaceSkills: jest.fn().mockRejectedValue(new Error('skills unavailable'))
        }) as RuntimeCapabilitiesService
        const middlewareRegistry = Object.assign(Object.create(AgentMiddlewareRegistry.prototype), {
            get: jest.fn()
        }) as AgentMiddlewareRegistry
        const service = new XpertProfileIndicatorsService(
            conversations,
            identity,
            runtimeCapabilities,
            middlewareRegistry
        )
        const xpert = Object.assign(new Xpert(), {
            id: 'assistant',
            tenantId: 'tenant-a',
            organizationId: null,
            agent: { key: 'primary' },
            graph: { nodes: [], connections: [] }
        })

        await expect(service.getIndicators(xpert)).resolves.toEqual({
            skillCount: null,
            toolCount: 0,
            subAgentCount: 0,
            conversationCount30d: null
        })
    })
})
