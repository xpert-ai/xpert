import { CommandBus } from '@nestjs/cqrs'
import { UserType } from '@xpert-ai/contracts'
import { ManagedQueueIdentityAdapter } from './managed-queue-identity.adapter'
import { ExecutionUserLoader } from '../user/execution-identity/execution-user-loader'
import { ExecutionContextReadyService } from '../user/execution-identity/execution-context-lifecycle.module'
import { ResolveExecutionIdentityCommand } from '../user/execution-identity/resolve-execution-identity.command'
import { createExecutionIdentity } from '../user/execution-identity/execution-identity'

function fixture() {
	const user = { id: 'actor', tenantId: 'tenant', type: UserType.USER, isActive: true }
	const users = { load: jest.fn(async () => user) }
	const commands = {
		execute: jest.fn(async (command: ResolveExecutionIdentityCommand) =>
			createExecutionIdentity(user, command.actor)
		)
	}
	const readiness = new ExecutionContextReadyService()
	const adapter = new ManagedQueueIdentityAdapter(
		users as unknown as ExecutionUserLoader,
		commands as unknown as CommandBus,
		readiness
	)
	return { user, users, commands, readiness, adapter }
}

it('waits for CQRS bootstrap and revalidates human organization access', async () => {
	const f = fixture()
	const result = f.adapter.resolve('actor', 'tenant', 'org')
	await Promise.resolve()
	expect(f.users.load).not.toHaveBeenCalled()
	f.readiness.onApplicationBootstrap()
	await expect(result).resolves.toBe(f.user)
	expect(f.commands.execute).toHaveBeenCalledWith(
		new ResolveExecutionIdentityCommand({
			userId: 'actor',
			tenantId: 'tenant',
			organizationId: 'org',
			kind: 'user'
		})
	)
	f.commands.execute.mockRejectedValueOnce(new Error('membership revoked'))
	await expect(f.adapter.resolve('actor', 'tenant', 'org')).rejects.toThrow('membership revoked')
})

it('does not convert a technical actor into a human and rejects inactive actors', async () => {
	const f = fixture()
	f.readiness.onApplicationBootstrap()
	f.user.type = UserType.COMMUNICATION
	await expect(f.adapter.resolve('actor', 'tenant', 'org')).resolves.toBe(f.user)
	expect(f.commands.execute).not.toHaveBeenCalled()
	f.user.isActive = false
	await expect(f.adapter.resolve('actor', 'tenant', 'org')).rejects.toThrow()
})
