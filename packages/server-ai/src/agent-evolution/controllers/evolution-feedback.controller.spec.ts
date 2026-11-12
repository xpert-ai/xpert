import { ForbiddenException, INestApplication } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { EvolutionTargetProviderRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import { PermissionGuard } from '@xpert-ai/server-core'
import { DataSource } from 'typeorm'
import { AssertChatConversationAccessQuery } from '../../chat-conversation/queries/conversation-assert-access.query'
import { AgentEvolutionGovernanceService, AgentEvolutionStore } from '../application'
import { EvolutionFeedbackController } from './evolution-feedback.controller'

describe('evolution feedback HTTP dispatch', () => {
    const id = '8dfe8a93-1d18-4378-8966-2c9996076873'
    const identity = { tenantId: 'tenant', organizationId: 'org' }
    const execution = { id, threadId: 'thread' }
    const review = jest.fn().mockResolvedValue({ outcome: 'reviewed' })
    const findOne = jest.fn().mockResolvedValue(execution)
    const execute = jest.fn()
    let app: INestApplication
    let url: string
    const post = async (path: string, body: object) => {
        const response = await fetch(url + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        })
        await response.text()
        return response.status
    }
    beforeAll(async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(identity.tenantId)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(identity.organizationId)
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('reviewer')
        const module = await Test.createTestingModule({
            controllers: [EvolutionFeedbackController],
            providers: [
                { provide: DataSource, useValue: { getRepository: () => ({ findOne }) } },
                { provide: QueryBus, useValue: { execute } },
                {
                    provide: EvolutionTargetProviderRegistry,
                    useValue: {
                        list: () => [
                            {
                                descriptor: { targetId: 'example' },
                                feedback: { routeKey: 'example', executionType: 'example-node', review }
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
        expect(await post('/example/executions/' + id + '/review', { label: 'one' })).toBe(403)
        expect(findOne).toHaveBeenCalledWith({
            where: { ...identity, id, type: 'example-node' },
            select: { id: true, threadId: true, outputs: true, createdAt: true, completedAt: true }
        })
        expect(execute).toHaveBeenCalledWith(
            new AssertChatConversationAccessQuery({ ...identity, threadId: 'thread' }, 'contribute')
        )
        expect(review).not.toHaveBeenCalled()
        expect(await post('/example/executions/' + id + '/review', { label: 'one' })).toBe(201)
        expect(review).toHaveBeenCalledWith(identity, execution, { label: 'one' })
    })

    it('rejects unknown providers and malformed execution IDs without looking up executions', async () => {
        expect(await post('/missing/executions/' + id + '/review', {})).toBe(404)
        expect(await post('/example/executions/not-a-uuid/review', {})).toBe(406)
        expect(findOne).not.toHaveBeenCalled()
        expect(review).not.toHaveBeenCalled()
    })
})
