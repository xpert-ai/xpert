import { UserType, type IUser } from '@xpert-ai/contracts'
import { FindOneOptions, Repository } from 'typeorm'
import { User } from '../user.entity'
import { ExecutionUserLoader, projectExecutionUser } from './execution-user-loader'
import { applyTokenPermissionCeiling } from '../../auth/strategies/jwt-permissions'

it('loads a tenant-bound credential-free projection and keeps JWT ceilings isolated from later jobs', async () => {
	const user: IUser = {
		id: 'user',
		tenantId: 'tenant',
		isActive: true,
		type: UserType.USER,
		hash: 'secret',
		emailVerification: { token: 'secret', userId: 'user', validUntil: new Date() },
		roleId: 'role',
		role: {
			id: 'role',
			name: 'TEST',
			rolePermissions: ['READ', 'WRITE'].map((permission) => ({
				roleId: 'role',
				tenantId: 'tenant',
				permission,
				enabled: true,
				role: { id: 'role', name: 'TEST' }
			}))
		}
	}
	const findOne = jest.fn(async (_options: FindOneOptions<User>) => user)
	const loader = new ExecutionUserLoader({ findOne } as unknown as Repository<User>)
	const http = await loader.load('user', 'tenant')
	applyTokenPermissionCeiling(http, ['READ'])
	const worker = await loader.load('user', 'tenant')
	expect(http.role.rolePermissions.map((grant) => grant.permission)).toEqual(['READ'])
	expect(worker.role.rolePermissions.map((grant) => grant.permission)).toEqual(['READ', 'WRITE'])
	expect(worker).not.toHaveProperty('hash')
	expect(worker).not.toHaveProperty('emailVerification')
	expect(findOne).toHaveBeenCalledWith(
		expect.objectContaining({
			where: { id: 'user', tenantId: 'tenant' },
			relations: expect.arrayContaining(['role.rolePermissions'])
		})
	)
	const selected = findOne.mock.calls[0][0].select
	expect(selected).not.toHaveProperty('hash')
	expect(selected).not.toHaveProperty('emailVerification')
	await loader.load('', 'tenant')
	expect(findOne).toHaveBeenCalledTimes(2)
})

it('distinguishes missing relationships from a loaded empty grant list without synthesizing rights', () => {
	expect(() => projectExecutionUser({ id: 'user', roleId: 'role' })).toThrow()
	expect(() => projectExecutionUser({ id: 'user', role: { name: 'TEST' } })).toThrow()
	expect(
		projectExecutionUser({ id: 'user', role: { name: 'TEST', rolePermissions: [] } }).role.rolePermissions
	).toEqual([])
})
