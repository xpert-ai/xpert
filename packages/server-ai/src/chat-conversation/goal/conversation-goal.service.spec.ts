jest.mock('@xpert-ai/server-core', () => ({
    TenantBaseEntity: class TenantBaseEntity {},
    TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
    TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
        constructor(
            public readonly repository: {
                delete: (criteria: string) => Promise<unknown>
                findAllInOrganizationOrTenant: (filter: unknown) => Promise<{ items: T[]; total: number }>
                save: (entity: unknown) => Promise<T>
            }
        ) {}

        save(entity: unknown): Promise<T> {
            return this.repository.save(entity)
        }

        create(entity: unknown): Promise<T> {
            return this.repository.save(entity)
        }

        delete(criteria: string): Promise<unknown> {
            return this.repository.delete(criteria)
        }

        findAllInOrganizationOrTenant(filter: unknown): Promise<{ items: T[]; total: number }> {
            return this.repository.findAllInOrganizationOrTenant(filter)
        }
    }
}))

jest.mock('../conversation.service', () => ({
    ChatConversationService: class ChatConversationService {}
}))

jest.mock('./conversation-goal.entity', () => ({
    ChatConversationGoal: class ChatConversationGoal {}
}))

import { ChatMessageEventTypeEnum, ChatMessageTypeEnum } from '@xpert-ai/contracts'
import { QueryBus } from '@nestjs/cqrs'
import { Repository } from 'typeorm'
import { RedisSseStreamService } from '../../shared/stream'
import { ChatConversationService } from '../conversation.service'
import { ChatConversationGoal } from './conversation-goal.entity'
import { ChatConversationGoalService } from './conversation-goal.service'

describe('ChatConversationGoalService', () => {
    let repository: {
        findAllInOrganizationOrTenant: jest.Mock<Promise<{ items: ChatConversationGoal[]; total: number }>, [unknown]>
        save: jest.Mock<Promise<ChatConversationGoal>, [unknown]>
        delete: jest.Mock<Promise<unknown>, [string]>
    }
    let queryBus: { execute: jest.Mock }
    let redisSseStreamService: { appendEvent: jest.Mock }
    let service: ChatConversationGoalService

    const existingGoal = {
        id: 'goal-1',
        conversationId: 'conversation-1',
        threadId: 'thread-1',
        objective: 'ship feature',
        goalSpec: {
            originalObjective: 'ship feature',
            executableGoal: 'Work toward this goal: ship feature',
            successCriteria: ['The requested goal is complete: ship feature'],
            constraints: ['Do not change unrelated behavior unless required by the goal.'],
            verificationChecklist: ['Verify that the requested goal has been completed.'],
            recommendedStrategy: 'act_then_verify',
            source: 'system',
            generatedAt: '2026-06-11T00:00:00.000Z'
        },
        status: 'active',
        tokensUsed: 12,
        elapsedSeconds: 3,
        continuationCount: 1,
        statusUpdatedAt: null,
        completedAt: null,
        blockedAt: null
    } as ChatConversationGoal

    beforeEach(() => {
        repository = {
            findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [existingGoal], total: 1 }),
            save: jest.fn(async (entity) => entity as ChatConversationGoal),
            delete: jest.fn().mockResolvedValue({})
        }
        queryBus = {
            execute: jest.fn().mockResolvedValue({
                items: [
                    {
                        id: 'execution-1',
                        threadId: 'thread-1',
                        status: 'running'
                    }
                ]
            })
        }
        redisSseStreamService = {
            appendEvent: jest.fn().mockResolvedValue('stream-entry-1')
        }

        service = new ChatConversationGoalService(
            repository as unknown as Repository<ChatConversationGoal>,
            { findOneInOrganizationOrTenant: jest.fn() } as unknown as ChatConversationService,
            queryBus as unknown as QueryBus,
            redisSseStreamService as unknown as RedisSseStreamService
        )
    })

    it('creates user goals without token budgets', async () => {
        ;(
            service as unknown as { conversationService: { findOneInOrganizationOrTenant: jest.Mock } }
        ).conversationService.findOneInOrganizationOrTenant.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1'
        })
        repository.findAllInOrganizationOrTenant.mockResolvedValue({ items: [], total: 0 })

        await service.setGoalFromUser('conversation-1', {
            objective: 'ship feature'
        })

        const removedBudgetField = 'token' + 'Budget'
        expect(repository.save.mock.calls[0]?.[0]).not.toHaveProperty(removedBudgetField)
        expect(repository.save.mock.calls[0]?.[0]).toMatchObject({
            objective: 'ship feature',
            goalSpec: expect.objectContaining({
                originalObjective: 'ship feature',
                executableGoal: expect.stringContaining('ship feature'),
                successCriteria: [expect.stringContaining('ship feature')],
                constraints: expect.any(Array),
                verificationChecklist: expect.any(Array),
                recommendedStrategy: 'act_then_verify',
                source: 'system',
                generatedAt: expect.any(String)
            })
        })
    })

    it('regenerates the goal spec when the user edits the objective', async () => {
        const goal = await service.patchGoalFromUser('conversation-1', {
            objective: 'ship updated feature'
        })

        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'goal-1',
                objective: 'ship updated feature',
                goalSpec: expect.objectContaining({
                    originalObjective: 'ship updated feature',
                    executableGoal: expect.stringContaining('ship updated feature')
                })
            })
        )
        expect(goal).toMatchObject({
            objective: 'ship updated feature',
            goalSpec: expect.objectContaining({
                originalObjective: 'ship updated feature'
            })
        })
    })

    it('preserves the goal spec when the user only changes status', async () => {
        const goal = await service.patchGoalFromUser('conversation-1', {
            status: 'paused'
        })

        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'goal-1',
                status: 'paused'
            })
        )
        expect(repository.save.mock.calls[0]?.[0]).not.toHaveProperty('goalSpec')
        expect(goal).toMatchObject({
            status: 'paused',
            goalSpec: existingGoal.goalSpec
        })
    })

    it('returns the full goal when the model updates the status', async () => {
        const goal = await service.updateGoalFromModel('conversation-1', 'complete')

        expect(repository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'goal-1',
                status: 'complete'
            })
        )
        expect(goal).toMatchObject({
            id: 'goal-1',
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            objective: 'ship feature',
            goalSpec: existingGoal.goalSpec,
            status: 'complete',
            tokensUsed: 12,
            elapsedSeconds: 3,
            continuationCount: 1
        })
    })

    it('reads goals through the organization-aware service path', async () => {
        await expect(service.getByConversationId('conversation-1')).resolves.toBe(existingGoal)

        expect(repository.findAllInOrganizationOrTenant).toHaveBeenCalledWith({
            where: {
                conversationId: 'conversation-1'
            },
            take: 1
        })
    })

    it('publishes a cleared event to the active run stream when an existing goal is cleared', async () => {
        await service.clearGoalFromUser('conversation-1')

        expect(repository.delete).toHaveBeenCalledWith('goal-1')
        expect(queryBus.execute).toHaveBeenCalledTimes(1)
        expect(redisSseStreamService.appendEvent).toHaveBeenCalledWith(
            'thread-1',
            'execution-1',
            expect.objectContaining({
                type: ChatMessageTypeEnum.EVENT,
                event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                data: expect.objectContaining({
                    type: 'thread_goal_cleared',
                    conversationId: 'conversation-1',
                    threadId: 'thread-1',
                    updatedAt: expect.any(String)
                })
            })
        )
    })

    it('does not publish a cleared event when no goal exists', async () => {
        repository.findAllInOrganizationOrTenant.mockResolvedValue({ items: [], total: 0 })

        await expect(service.clearGoalFromUser('conversation-1')).resolves.toBeNull()

        expect(repository.delete).not.toHaveBeenCalled()
        expect(queryBus.execute).not.toHaveBeenCalled()
        expect(redisSseStreamService.appendEvent).not.toHaveBeenCalled()
    })
})
