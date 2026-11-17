import { ForbiddenException } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import type { ExecutionReviewApi, IExecutionReview } from '@xpert-ai/contracts'
import { EvolutionTargetProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { DataSource } from 'typeorm'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { toProjectViewAccess } from '../../xpert-project/services/project-view-access'
import { AgentEvolutionStore } from '../application/agent-evolution.store'
import { ExecutionReviewEntity, LearningEventEntity } from '../entities'
import { ExecutionReviewService } from './execution-review.service'

describe('execution review service', () => {
    const scope = {
        tenantId: 'tenant',
        organizationId: 'org',
        projectId: 'project',
        userId: 'supervisor',
        xpertId: 'assistant'
    }
    const id = '10000000-0000-4000-8000-000000000001'
    const messageId = '20000000-0000-4000-8000-000000000001'
    const source = { id: messageId, content: '检查发到 client@example.org 的退款申请', createdInThreadId: 'thread' }
    const run = { id, parentId: 'parent-run', threadId: 'thread', createdAt: new Date() }
    let previouslyReviewed: boolean
    const query = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        setParameter: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        getRawAndEntities: async () => ({
            raw: [{ conversation_id: 'conversation', previously_reviewed: previouslyReviewed }],
            entities: [run]
        })
    }
    const messages = jest.fn()
    const receipts = new Map<string, IExecutionReview>()
    const lock = jest.fn()
    const insert = jest.fn(async (record: IExecutionReview) => {
        receipts.set(record.executionId, record)
    })
    const manager = {
        query: lock,
        getRepository(entity: unknown) {
            if (entity === XpertAgentExecution) return { createQueryBuilder: () => query }
            if (entity === ChatMessage) return { findOneBy: messages }
            if (entity === ExecutionReviewEntity)
                return { findOneBy: ({ executionId }: { executionId: string }) => receipts.get(executionId), insert }
            if (entity === LearningEventEntity) return { findOneBy: async () => null }
            throw new Error('Unexpected repository')
        }
    }
    const prepare = jest.fn(() => ({ observations: [] }))
    const snapshot = jest.fn()
    const checkAccess = jest.fn()
    const decision = {
        executionId: id,
        bundleHash: 'bundle',
        disposition: 'confirmed',
        expectedLabel: 'refund',
        use: 'case_only'
    } as const
    const managerView = { feature: 'review', projectAccess: toProjectViewAccess('manager', 'active') }
    let service: ExecutionReviewService
    let api: ExecutionReviewApi

    beforeAll(async () => {
        const module = await Test.createTestingModule({
            providers: [
                ExecutionReviewService,
                {
                    provide: DataSource,
                    useValue: {
                        manager,
                        transaction: (apply: (tx: typeof manager) => Promise<unknown>) => apply(manager)
                    }
                },
                { provide: CommandBus, useValue: { execute: checkAccess } },
                { provide: AgentEvolutionStore, useValue: {} },
                {
                    provide: EvolutionTargetProviderRegistry,
                    useValue: {
                        get: () => ({
                            descriptor: { status: 'active' },
                            feedback: {
                                executionType: 'intent-node',
                                workbench: {
                                    feature: 'review',
                                    snapshot,
                                    sourceMatches: (_run: unknown, text: string) => text === source.content,
                                    legacyKey: (executionId: string) => 'intent-' + executionId,
                                    prepare
                                }
                            }
                        })
                    }
                }
            ]
        }).compile()
        service = module.get(ExecutionReviewService)
        api = service.forView(scope, managerView)!
    })

    beforeEach(() => {
        jest.clearAllMocks()
        receipts.clear()
        previouslyReviewed = false
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(scope.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(scope.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(scope.userId)
        snapshot.mockReturnValue({ versionId: 'v1', bundleHash: 'bundle', originalLabel: 'refund' })
        messages.mockImplementation(async ({ role }: { role: string }) =>
            role === 'ai' ? { parentId: messageId } : source
        )
    })
    afterEach(() => jest.restoreAllMocks())

    it.each([
        toProjectViewAccess('member', 'active'),
        toProjectViewAccess('editor', 'active'),
        toProjectViewAccess('owner', 'archived'),
        toProjectViewAccess('manager', 'archived'),
        null
    ])('withholds the API for project access %j', (projectAccess) => {
        expect(service.forView(scope, { ...managerView, projectAccess })).toBeUndefined()
    })

    it.each(['tenantId', 'organizationId', 'userId', 'xpertId', 'projectId'])('requires a bound %s', (field) => {
        expect(service.forView({ ...scope, [field]: undefined }, managerView)).toBeUndefined()
    })

    it('requires a host-authorized View even when the identity is complete', () => {
        expect(service.forView(scope)).toBeUndefined()
    })

    it('restricts the bound API to targets for the verified View feature', async () => {
        const otherView = service.forView(scope, { ...managerView, feature: 'other' })!
        await expect(otherView.get('intent', id)).rejects.toMatchObject({ status: 403 })
        expect(query.where).not.toHaveBeenCalled()
    })

    it('denies list, get and submit on an issued API after the project grant is revoked', async () => {
        await api.get('intent', id)
        const denied = new ForbiddenException()
        checkAccess.mockRejectedValueOnce(denied).mockRejectedValueOnce(denied).mockRejectedValueOnce(denied)

        await expect(api.list('intent', { queue: 'pending', page: 1, pageSize: 1 })).rejects.toBe(denied)
        await expect(api.get('intent', id)).rejects.toBe(denied)
        await expect(api.submit('intent', decision)).rejects.toBe(denied)
        expect(query.where).toHaveBeenCalledTimes(1)
        expect(insert).not.toHaveBeenCalled()
    })

    it('resolves the exact parent message for a historical execution without a recorded source ID', async () => {
        expect((await api.get('intent', id)).sourceText).toBe('检查发到 [email] 的退款申请')
        const sameCase = {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            conversationId: 'conversation'
        }
        expect(messages).toHaveBeenNthCalledWith(1, { ...sameCase, executionId: run.parentId, role: 'ai' })
        expect(messages).toHaveBeenNthCalledWith(2, { ...sameCase, id: messageId, role: 'human' })
    })

    it('requires insufficient evidence when the recorded source and the parent refer to different turns', async () => {
        snapshot.mockReturnValue({
            versionId: 'v1',
            bundleHash: 'bundle',
            originalLabel: 'refund',
            sourceMessageId: '20000000-0000-4000-8000-000000000002'
        })
        expect((await api.get('intent', id)).sourceText).toBeNull()
        await expect(api.submit('intent', decision)).rejects.toMatchObject({ response: { code: 'source_unavailable' } })
        expect(insert).not.toHaveBeenCalled()
        await expect(
            api.submit('intent', {
                executionId: id,
                bundleHash: 'bundle',
                disposition: 'insufficient',
                use: 'case_only'
            })
        ).resolves.toMatchObject({ disposition: 'insufficient' })
    })

    it('rejects a case already reviewed through the older feedback route', async () => {
        previouslyReviewed = true
        await expect(api.submit('intent', decision)).rejects.toMatchObject({
            response: { code: 'execution_already_reviewed' }
        })
        expect(prepare).not.toHaveBeenCalled()
        expect(insert).not.toHaveBeenCalled()
    })

    it('rejects a stale version, persists an audited receipt, and returns it for an exact retry', async () => {
        await expect(api.submit('intent', { ...decision, bundleHash: 'stale' })).rejects.toMatchObject({
            response: { code: 'review_version_changed' }
        })
        const receipt = await api.submit('intent', decision)
        expect(receipt).toMatchObject({ reviewerId: scope.userId, versionId: 'v1' })
        expect(insert).toHaveBeenCalledWith(
            expect.objectContaining({
                id: receipt.receiptId,
                createdById: scope.userId,
                updatedById: scope.userId,
                receipt
            })
        )
        expect((await api.get('intent', id)).receipt).toEqual(receipt)
        await expect(api.submit('intent', decision)).resolves.toEqual(receipt)
        await expect(api.submit('intent', { ...decision, disposition: 'corrected' })).rejects.toMatchObject({
            response: { code: 'execution_already_reviewed' }
        })
        expect(prepare).toHaveBeenCalledTimes(1)
        expect(insert).toHaveBeenCalledTimes(1)
    })
})
