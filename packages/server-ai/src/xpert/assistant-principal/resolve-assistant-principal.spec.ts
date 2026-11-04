import { QueryBus } from '@nestjs/cqrs'
import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { runWithExecutionIdentity } from '@xpert-ai/server-core'
import { ResolveAssistantPrincipalCommand } from './resolve-assistant-principal.command'
import { DataSource } from 'typeorm'
import { AssistantPrincipalAccessService } from './assistant-principal-access.service'
import { ResolveAssistantPrincipalHandler } from './resolve-assistant-principal.handler'

function fixture() {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'assistant-user' }
    const assistant = { id: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: actor.userId }
    const user = { id: actor.userId, tenantId: 'tenant', type: UserType.COMMUNICATION, isActive: true }
    const access = {
        isPrincipal: jest.fn(async () => true),
        find: jest.fn(async () => ({ user, assistant, assistants: [assistant] }))
    }
    const database = { getRepository: () => ({ findOneBy: async () => assistant }) } as unknown as DataSource
    const queries = { execute: jest.fn(async () => assistant) } as unknown as QueryBus
    const handler = new ResolveAssistantPrincipalHandler(
        database,
        access as unknown as AssistantPrincipalAccessService,
        queries
    )
    jest.spyOn(RequestContext, 'currentUser').mockReturnValue(undefined)
    return { actor, assistant, user, access, queries, handler }
}

afterEach(() => jest.restoreAllMocks())
it('restores a persisted Assistant actor using the host identity adapter', async () => {
    const f = fixture()
    const result = await f.handler.execute(new ResolveAssistantPrincipalCommand(f.actor))
    expect(result.user.id).toBe(f.assistant.userId)
})
it('returns no Assistant identity for an ordinary task actor', async () => {
    const f = fixture()
    f.access.isPrincipal.mockResolvedValue(false)
    expect(await f.handler.execute(new ResolveAssistantPrincipalCommand(f.actor))).toBeNull()
})
it('rejects an unavailable Assistant before entering execution context', async () => {
    const f = fixture()
    f.access.find.mockResolvedValue(null)
    await expect(f.handler.execute(new ResolveAssistantPrincipalCommand(f.actor))).rejects.toThrow()
})
it('does not accept a different persisted user for the selected Assistant', async () => {
    const f = fixture()
    await expect(
        f.handler.execute(
            new ResolveAssistantPrincipalCommand({ ...f.actor, assistantId: 'assistant', userId: 'human' })
        )
    ).rejects.toThrow()
})
