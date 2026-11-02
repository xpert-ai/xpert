import { UserType, type IApiPrincipal } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveAssistantExecutionIdentityHandler } from './resolve-assistant-execution-identity.handler'
import { ResolveAssistantExecutionIdentityCommand } from './resolve-assistant-execution-identity.command'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'

const actor = { tenantId: 'tenant', organizationId: 'organization', userId: 'technical-user' }
function setup() {
    const user = { id: actor.userId, tenantId: actor.tenantId, type: UserType.COMMUNICATION }
    const assistant = {
        id: 'assistant',
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        userId: user.id,
        active: true,
        latest: true,
        publishAt: new Date(),
        createdById: 'payer'
    }
    const conversation = { id: 'conversation', ...actor, createdById: user.id, xpertId: assistant.id }
    const users = { findOneBy: jest.fn().mockResolvedValue(user) }
    const assistants = { findOne: jest.fn().mockResolvedValue(assistant) }
    const conversations = { findOneBy: jest.fn().mockResolvedValue(conversation) }
    const handler = new ResolveAssistantExecutionIdentityHandler(
        users as never,
        assistants as never,
        conversations as never
    )
    return { handler, user, assistant, conversation, users, assistants, conversations }
}
afterEach(() => jest.restoreAllMocks())
describe('managed execution Assistant identity', () => {
    it('restores the exact technical actor from an owned persisted conversation without impersonating the payer', async () => {
        const f = setup()
        const result = await f.handler.execute(new ResolveAssistantExecutionIdentityCommand(actor, 'conversation'))
        expect(f.conversations.findOneBy).toHaveBeenCalledWith({
            id: 'conversation',
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            createdById: actor.userId
        })
        expect(f.assistants.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'assistant',
                    tenantId: actor.tenantId,
                    organizationId: actor.organizationId,
                    userId: actor.userId,
                    latest: true
                }
            })
        )
        expect(result.user.id).toBe(actor.userId)
        expect(result.user.ownerUserId).toBe('payer')
        await runWithCapturedRequestContext(captureRequestContext({ ...actor, user: result.user }), async () => {
            expect(RequestContext.currentUserId()).toBe(actor.userId)
            expect(RequestContext.currentApiPrincipal()?.resourceScope).toEqual({
                kind: 'assistant',
                xpertId: 'assistant'
            })
        })
    })
    it('cannot use a supplied Assistant id without a persisted conversation or authenticated audience', async () => {
        const f = setup()
        await expect(
            f.handler.execute(new ResolveAssistantExecutionIdentityCommand(actor, undefined, 'assistant'))
        ).rejects.toThrow()
        expect(f.assistants.findOne).not.toHaveBeenCalled()
    })
    it.each(['missing', 'group', 'project', 'other-assistant'])('rejects %s conversation binding', async (kind) => {
        const f = setup()
        f.conversations.findOneBy.mockResolvedValue(
            kind === 'missing'
                ? null
                : {
                      ...f.conversation,
                      ...(kind === 'group' ? { purpose: 'group_assistant_runtime' } : {}),
                      ...(kind === 'project' ? { projectId: 'project' } : {})
                  }
        )
        await expect(
            f.handler.execute(
                new ResolveAssistantExecutionIdentityCommand(
                    actor,
                    'conversation',
                    kind === 'other-assistant' ? 'other' : 'assistant'
                )
            )
        ).rejects.toThrow()
    })
    it.each(['missing', 'disabled', 'unpublished', 'historical'])('rejects %s Assistant', async (kind) => {
        const f = setup()
        f.assistants.findOne.mockResolvedValue(
            kind === 'missing'
                ? null
                : {
                      ...f.assistant,
                      active: kind !== 'disabled',
                      latest: kind !== 'historical',
                      publishAt: kind === 'unpublished' ? null : new Date()
                  }
        )
        await expect(
            f.handler.execute(new ResolveAssistantExecutionIdentityCommand(actor, 'conversation'))
        ).rejects.toThrow()
    })
    it.each(['audience', 'actor', 'organization', 'requested-user'])(
        'rejects conflicting ambient %s rather than erasing it',
        async (kind) => {
            const f = setup()
            const principal: IApiPrincipal = {
                ...f.user,
                principalType: 'api_key',
                resourceScope: { kind: 'assistant', xpertId: kind === 'audience' ? 'other' : 'assistant' },
                ...(kind === 'actor' ? { id: 'other-user' } : {}),
                ...(kind === 'requested-user' ? { requestedUserId: 'payer' } : {})
            }
            await runWithCapturedRequestContext(
                captureRequestContext({
                    ...actor,
                    user: principal,
                    organizationId: kind === 'organization' ? 'other' : actor.organizationId
                }),
                async () => {
                    await expect(
                        f.handler.execute(new ResolveAssistantExecutionIdentityCommand(actor, 'conversation'))
                    ).rejects.toThrow()
                }
            )
        }
    )
    it('does not admit a human who failed the separate organization policy', async () => {
        const f = setup()
        f.users.findOneBy.mockResolvedValue({ ...f.user, type: UserType.USER })
        expect(await f.handler.execute(new ResolveAssistantExecutionIdentityCommand(actor, 'conversation'))).toBeNull()
        expect(f.conversations.findOneBy).not.toHaveBeenCalled()
    })
})
