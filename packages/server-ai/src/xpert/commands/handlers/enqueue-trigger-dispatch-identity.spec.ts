import { Test, TestingModule } from '@nestjs/testing'
import { IUser, STATE_VARIABLE_HUMAN, UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserService } from '@xpert-ai/server-core'
import { HandoffQueueService } from '../../../handoff/message-queue.service'
import { XpertService } from '../../xpert.service'
import { XpertEnqueueTriggerDispatchCommand } from '../enqueue-trigger-dispatch.command'
import { XpertEnqueueTriggerDispatchHandler } from './enqueue-trigger-dispatch.handler'

describe('Trigger dispatch authenticated provenance', () => {
    let module: TestingModule
    let actor: IUser | null
    let organizationId: string | null
    let target: { id: string; tenantId: string; organizationId: string | null }
    const enqueue = jest.fn()

    beforeEach(async () => {
        actor = { id: 'user', tenantId: 'tenant', type: UserType.USER }
        organizationId = 'org'
        target = { id: 'pipeline', tenantId: 'tenant', organizationId: 'org' }
        enqueue.mockReset()
        jest.spyOn(RequestContext, 'currentUser').mockImplementation(() => actor)
        jest.spyOn(RequestContext, 'getOrganizationId').mockImplementation(() => organizationId)
        module = await Test.createTestingModule({
            providers: [
                XpertEnqueueTriggerDispatchHandler,
                { provide: XpertService, useValue: { findOne: jest.fn(async () => target) } },
                { provide: UserService, useValue: { findOne: jest.fn(async () => ({ preferredLanguage: 'en' })) } },
                { provide: HandoffQueueService, useValue: { enqueue } }
            ]
        }).compile()
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        await module?.close()
    })

    async function dispatch(userId: string | null = 'user') {
        await module
            .get(XpertEnqueueTriggerDispatchHandler)
            .execute(
                new XpertEnqueueTriggerDispatchCommand(
                    'pipeline',
                    userId,
                    { [STATE_VARIABLE_HUMAN]: { input: 'Process pipeline' } },
                    { isDraft: false, from: 'knowledge' }
                )
            )
        expect(enqueue).toHaveBeenCalledTimes(1)
    }

    function expectUnmarked() {
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: expect.not.objectContaining({ authenticatedUserId: expect.anything() })
            })
        )
    }

    it('marks the matching ordinary actor without serializing its grants', async () => {
        await dispatch()
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                tenantId: 'tenant',
                headers: {
                    userId: 'user',
                    authenticatedUserId: 'user',
                    organizationId: 'org',
                    language: 'en',
                    source: 'xpert'
                }
            })
        )
    })

    it.each(['user', 'tenant', 'organization'])('does not mark a mismatched %s', async (mismatch) => {
        if (mismatch === 'user') actor.id = 'other-user'
        else if (mismatch === 'tenant') actor.tenantId = 'other-tenant'
        else organizationId = 'other-org'
        await dispatch()
        expectUnmarked()
    })

    it.each(['missing', 'legacy', 'assistant', 'api', 'delegated'])(
        'does not promote a %s actor to an ordinary user',
        async (kind) => {
            if (kind === 'missing') actor = null
            else if (kind === 'legacy') delete actor.type
            else if (kind === 'assistant') actor.type = UserType.COMMUNICATION
            else if (kind === 'api') actor = Object.assign(actor, { apiKey: {} })
            else actor = Object.assign(actor, { resourceScope: {} })
            await dispatch()
            expectUnmarked()
        }
    )

    it.each(['org', null])('allows a tenant-level target from authenticated scope %s', async (scope) => {
        target.organizationId = null
        organizationId = scope
        await dispatch()
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                headers: { userId: 'user', authenticatedUserId: 'user', language: 'en', source: 'xpert' }
            })
        )
    })

    it('preserves the Assistant principal for a trigger with no explicit user even in an authenticated request', async () => {
        await dispatch(null)
        expectUnmarked()
        expect(enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                payload: expect.objectContaining({
                    options: expect.objectContaining({
                        runtimePrincipal: { type: 'assistant', xpertId: 'pipeline' }
                    })
                }),
                headers: { organizationId: 'org', source: 'xpert' }
            })
        )
    })
})
