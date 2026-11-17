import { ForbiddenException, INestApplication } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { EvolutionTargetProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { AgentEvolutionGovernanceService, AgentEvolutionStore } from '../application'
import { ExecutionReviewEntity, LearningEventEntity } from '../entities'
import { ExecutionReviewService } from '../execution-review/execution-review.service'
import { EvolutionFeedbackController } from './evolution-feedback.controller'

describe('evolution feedback HTTP dispatch', () => {
    const id = '8dfe8a93-1d18-4378-8966-2c9996076873'
    const identity = { tenantId: 'tenant', organizationId: 'org' }
    const execution = { id, threadId: 'thread' }
    const review = jest.fn().mockResolvedValue({ outcome: 'reviewed' })
    const findOne = jest.fn().mockResolvedValue(execution)
    const findOneBy = jest.fn()
    const lock = jest.fn()
    const matchesLegacy = jest.fn()
    const execute = jest.fn()
    const assertProjectAccess = jest.fn()
    let app: INestApplication
    let url: string
    const post = async (path: string, body: object) => {
        const response = await fetch(url + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        return response
    }
    beforeAll(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(identity.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(identity.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('reviewer')
        const module = await Test.createTestingModule({
            controllers: [EvolutionFeedbackController],
            providers: [
                ExecutionReviewService,
                { provide: CommandBus, useValue: { execute: assertProjectAccess } },
                {
                    provide: DataSource,
                    useValue: {
                        getRepository: () => ({ findOne }),
                        transaction: (apply: (manager: object) => Promise<unknown>) => apply({ query: lock, findOneBy })
                    }
                },
                { provide: QueryBus, useValue: { execute } },
                {
                    provide: EvolutionTargetProviderRegistry,
                    useValue: {
                        list: () => [
                            {
                                descriptor: { targetId: 'example' },
                                feedback: { routeKey: 'example', executionType: 'example-node', review }
                            },
                            {
                                descriptor: { targetId: 'project-intent' },
                                feedback: {
                                    routeKey: 'project-intent',
                                    executionType: 'example-node',
                                    workbench: { matchesLegacy },
                                    review
                                }
                            }
                        ]
                    }
                },
                { provide: AgentEvolutionStore, useValue: {} },
                { provide: AgentEvolutionGovernanceService, useValue: {} }
            ]
        })
            .overrideGuard(PermissionGuard)
            .useValue({ canActivate: () => true })
            .compile()
        app = module.createNestApplication()
        await app.listen(0, '127.0.0.1')
        url = await app.getUrl()
    })
    afterAll(async () => {
        await app?.close()
        jest.restoreAllMocks()
    })
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('checks conversation contribution in the current organization before calling the plugin', async () => {
        execute.mockRejectedValueOnce(new ForbiddenException())
        expect((await post('/example/executions/' + id + '/review', { label: 'one' })).status).toBe(403)
        expect(findOne).toHaveBeenCalledWith({
            where: { ...identity, id, type: 'example-node' },
            select: { id: true, threadId: true, outputs: true, createdAt: true, completedAt: true }
        })
        expect(execute).toHaveBeenCalledWith(
            new AssertChatConversationAccessQuery({ ...identity, threadId: 'thread' }, 'contribute')
        )
        expect(review).not.toHaveBeenCalled()
        expect((await post('/example/executions/' + id + '/review', { label: 'one' })).status).toBe(201)
        expect(review).toHaveBeenCalledWith(identity, execution, { label: 'one' })
    })

    it('rejects unknown providers and malformed execution IDs without looking up executions', async () => {
        expect((await post('/missing/executions/' + id + '/review', {})).status).toBe(404)
        expect((await post('/example/executions/not-a-uuid/review', {})).status).toBe(406)
        expect(findOne).not.toHaveBeenCalled()
        expect(review).not.toHaveBeenCalled()
    })

    it('requires project management on the legacy route for a project review target', async () => {
        execute.mockResolvedValueOnce({ projectId: 'project', xpertId: 'assistant' })
        assertProjectAccess.mockRejectedValueOnce(new ForbiddenException())
        expect((await post('/project-intent/executions/' + id + '/review', { label: 'one' })).status).toBe(403)
        expect(assertProjectAccess).toHaveBeenCalledWith(
            new AssertProjectAssistantAccessCommand('project', 'assistant', 'manage')
        )
        expect(review).not.toHaveBeenCalled()
    })

    it('reuses the recorded learning event for an equivalent legacy submission', async () => {
        execute.mockResolvedValueOnce({ projectId: 'project', xpertId: 'assistant' })
        const receipt = { learningEventId: 'first-event' }
        const event = { eventId: 'first-event', finalOutcomeSummary: 'refund' }
        findOneBy.mockResolvedValueOnce({ receipt }).mockResolvedValueOnce({ value: event })
        matchesLegacy.mockReturnValueOnce(true)
        const response = await post('/project-intent/executions/' + id + '/review', { expectedIntent: 'refund' })
        expect(response.status).toBe(201)
        expect(await response.json()).toEqual(event)
        expect(lock).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), [
            JSON.stringify(['execution-review', identity.tenantId, identity.organizationId, 'project-intent', id])
        ])
        expect(findOneBy).toHaveBeenNthCalledWith(1, ExecutionReviewEntity, {
            ...identity,
            targetId: 'project-intent',
            executionId: id
        })
        expect(findOneBy).toHaveBeenNthCalledWith(2, LearningEventEntity, {
            ...identity,
            targetId: 'project-intent',
            eventId: event.eventId
        })
        expect(review).not.toHaveBeenCalled()
    })

    it('rejects conflicting legacy feedback without rewriting the recorded decision', async () => {
        execute.mockResolvedValueOnce({ projectId: 'project', xpertId: 'assistant' })
        findOneBy.mockResolvedValueOnce({ receipt: { learningEventId: 'first-event' } })
        matchesLegacy.mockReturnValueOnce(false)
        const response = await post('/project-intent/executions/' + id + '/review', { expectedIntent: 'refund' })
        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({ code: 'execution_already_reviewed' })
        expect(review).not.toHaveBeenCalled()
    })
})
