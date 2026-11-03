import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { UserType } from '@xpert-ai/contracts'
import { createExecutionIdentity } from '../../execution-identity/execution-identity'
import { ResolveExecutionIdentityCommand } from '../../execution-identity/resolve-execution-identity.command'
import { ResolveRuntimeUserHandler } from './resolve-runtime-user.handler'
import { ResolveRuntimeUserCommand } from '../resolve-runtime-user.command'

it('keeps the authenticated scope constraint and delegates permission restoration to the shared boundary', async () => {
	const current = { tenantId: 'tenant', userId: 'user', organizationId: 'org' }
	jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue(current.tenantId)
	jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(current.userId)
	jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(current.organizationId)
	const commands = {
		execute: jest.fn(async (command: ResolveExecutionIdentityCommand) =>
			createExecutionIdentity(
				{
					id: command.actor.userId,
					tenantId: command.actor.tenantId,
					type: UserType.USER,
					isActive: true,
					role: { name: 'TEST', rolePermissions: [] }
				},
				command.actor
			)
		)
	}
	const module = await Test.createTestingModule({
		providers: [ResolveRuntimeUserHandler, { provide: CommandBus, useValue: commands }]
	}).compile()
	try {
		const handler = module.get(ResolveRuntimeUserHandler)
		await expect(handler.execute(new ResolveRuntimeUserCommand('tenant', 'user', 'org'))).resolves.toMatchObject({
			role: { rolePermissions: [] }
		})
		expect(commands.execute).toHaveBeenCalledWith(new ResolveExecutionIdentityCommand({ ...current, kind: 'user' }))
		commands.execute.mockClear()
		for (const command of [
			new ResolveRuntimeUserCommand('other', 'user', 'org'),
			new ResolveRuntimeUserCommand('tenant', 'other', 'org'),
			new ResolveRuntimeUserCommand('tenant', 'user')
		])
			await expect(handler.execute(command)).rejects.toMatchObject({ status: 403 })
		expect(commands.execute).not.toHaveBeenCalled()
		commands.execute.mockRejectedValueOnce(new Error('current membership revoked'))
		await expect(handler.execute(new ResolveRuntimeUserCommand('tenant', 'user', 'org'))).rejects.toThrow(
			'current membership revoked'
		)
	} finally {
		jest.restoreAllMocks()
		await module.close()
	}
})
