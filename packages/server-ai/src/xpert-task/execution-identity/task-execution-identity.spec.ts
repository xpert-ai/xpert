import { ResolveAssistantPrincipalCommand } from '../../xpert/assistant-principal/resolve-assistant-principal.command'
import { CommandBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { executionIdentityFixture } from '../../shared/testing/execution-identity.fixture'
import { runWithTaskExecutionIdentity } from './task-execution-identity'

it('resolves the persisted actor even inside a different authenticated request', async () => {
    const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'owner' }
    const execute = jest.fn(async (command: ResolveExecutionIdentityCommand | ResolveAssistantPrincipalCommand) =>
        command instanceof ResolveAssistantPrincipalCommand ? null : executionIdentityFixture(command.actor)
    )
    const commands = { execute } as unknown as CommandBus
    await runWithExecutionIdentity(executionIdentityFixture({ tenantId: 'other', userId: 'ambient' }), async () => {
        await runWithTaskExecutionIdentity(commands, scope, scope.userId, async (user) => {
            await Promise.resolve()
            expect(user.id).toBe('owner')
            expect(RequestContext.currentTenantId()).toBe('tenant')
            expect(RequestContext.getOrganizationId()).toBe('org')
        })
        expect(RequestContext.currentUserId()).toBe('ambient')
    })
    expect(execute).toHaveBeenCalledWith(new ResolveExecutionIdentityCommand({ ...scope, kind: 'user' }))
})

it('never executes under an ambient user when the persisted actor is unavailable', async () => {
    const work = jest.fn()
    const commands = { execute: jest.fn().mockRejectedValue(new Error('actor revoked')) } as unknown as CommandBus
    await expect(runWithTaskExecutionIdentity(commands, { tenantId: 'tenant' }, undefined, work)).rejects.toThrow(
        'actor revoked'
    )
    expect(work).not.toHaveBeenCalled()
})
