export {}

jest.mock('@xpert-ai/contracts', () => ({
	DEFAULT_TENANT: 'Default Tenant'
}))

jest.mock('../../../core/context', () => ({
	RequestContext: {
		currentRequest: jest.fn(() => ({
			headers: {}
		}))
	},
	getFirstHeaderValue: jest.fn((value?: string | string[]) => {
		if (Array.isArray(value)) {
			return value.map((item) => item?.trim()).find(Boolean)
		}

		return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
	})
}))

jest.mock('../../../tenant/tenant.service', () => ({
	TenantService: class TenantService {}
}))

jest.mock('../../../user/user.service', () => ({
	UserService: class UserService {}
}))

jest.mock('../../auth.service', () => ({
	AuthService: class AuthService {}
}))

const { NotFoundException } = require('@nestjs/common')
const bcrypt = require('bcryptjs')
const { RequestContext } = require('../../../core/context')
const { AuthLoginCommand } = require('../auth.login.command')
const { AuthLoginHandler } = require('./auth.login.handler')

describe('AuthLoginHandler', () => {
	const authService = {
		createToken: jest.fn(),
		updateRefreshToken: jest.fn()
	}
	const userService = {
		findOneByOptions: jest.fn()
	}
	const tenantService = {
		findOneOrFailByOptions: jest.fn()
	}

	let handler: InstanceType<typeof AuthLoginHandler>

	beforeEach(() => {
		jest.clearAllMocks()
		handler = new AuthLoginHandler(authService as any, userService as any, tenantService as any)
		RequestContext.currentRequest.mockReturnValue({
			headers: {}
		})
		tenantService.findOneOrFailByOptions.mockResolvedValue({
			success: true,
			record: {
				id: 'default-tenant'
			}
		})
		authService.createToken.mockResolvedValue({
			token: 'jwt-token',
			refreshToken: 'refresh-token'
		})
		authService.updateRefreshToken.mockResolvedValue(undefined)
	})

	it('limits password login to the current tenant context', async () => {
		RequestContext.currentRequest.mockReturnValue({
			headers: {
				'tenant-id': 'tenant-1',
				'organization-id': 'org-1',
				'x-scope-level': 'tenant'
			}
		})
		userService.findOneByOptions.mockResolvedValue({
			id: 'user-1',
			email: 'new.user@example.com',
			tenantId: 'tenant-1',
			hash: 'stored-hash'
		})
		jest.spyOn(bcrypt, 'compare').mockResolvedValue(true)

		await expect(
			handler.execute(new AuthLoginCommand({ email: 'New.User@example.com', password: 'password' }))
		).resolves.toEqual({
			user: expect.objectContaining({
				id: 'user-1',
				tenantId: 'tenant-1'
			}),
			token: 'jwt-token',
			refreshToken: 'refresh-token'
		})

		expect(userService.findOneByOptions).toHaveBeenCalledWith({
			where: [
				{ email: 'new.user@example.com', emailVerified: true, tenantId: 'tenant-1' },
				{ username: 'new.user@example.com', tenantId: 'tenant-1' }
			],
			relations: ['role', 'role.rolePermissions', 'employee'],
			order: {
				createdAt: 'DESC'
			}
		})
		expect(tenantService.findOneOrFailByOptions).not.toHaveBeenCalled()
		expect(authService.updateRefreshToken).toHaveBeenCalledWith('user-1', 'refresh-token')
	})

	it('falls back to a global user lookup when the Default tenant scoped lookup misses', async () => {
		RequestContext.currentRequest.mockReturnValue({
			headers: {
				'tenant-id': 'default-tenant'
			}
		})
		userService.findOneByOptions
			.mockRejectedValueOnce(new NotFoundException('The requested record was not found'))
			.mockResolvedValueOnce({
				id: 'user-2',
				email: 'external@example.com',
				tenantId: 'tenant-2',
				hash: 'stored-hash'
			})
		jest.spyOn(bcrypt, 'compare').mockResolvedValue(true)

		await expect(
			handler.execute(new AuthLoginCommand({ email: 'external@example.com', password: 'password' }))
		).resolves.toEqual({
			user: expect.objectContaining({
				id: 'user-2',
				tenantId: 'tenant-2'
			}),
			token: 'jwt-token',
			refreshToken: 'refresh-token'
		})

		expect(tenantService.findOneOrFailByOptions).toHaveBeenCalledWith({
			select: ['id'],
			where: {
				name: 'Default Tenant'
			}
		})
		expect(userService.findOneByOptions).toHaveBeenNthCalledWith(1, {
			where: [
				{ email: 'external@example.com', emailVerified: true, tenantId: 'default-tenant' },
				{ username: 'external@example.com', tenantId: 'default-tenant' }
			],
			relations: ['role', 'role.rolePermissions', 'employee'],
			order: {
				createdAt: 'DESC'
			}
		})
		expect(userService.findOneByOptions).toHaveBeenNthCalledWith(2, {
			where: [{ email: 'external@example.com', emailVerified: true }, { username: 'external@example.com' }],
			relations: ['role', 'role.rolePermissions', 'employee'],
			order: {
				createdAt: 'DESC'
			}
		})
		expect(authService.updateRefreshToken).toHaveBeenCalledWith('user-2', 'refresh-token')
	})

	it('does not fall back to a global lookup when a non-default tenant scoped lookup misses', async () => {
		RequestContext.currentRequest.mockReturnValue({
			headers: {
				'tenant-id': 'tenant-1'
			}
		})
		userService.findOneByOptions.mockRejectedValueOnce(new NotFoundException('The requested record was not found'))

		await expect(
			handler.execute(new AuthLoginCommand({ email: 'missing@example.com', password: 'password' }))
		).resolves.toBeNull()

		expect(tenantService.findOneOrFailByOptions).toHaveBeenCalled()
		expect(userService.findOneByOptions).toHaveBeenCalledTimes(1)
		expect(authService.createToken).not.toHaveBeenCalled()
		expect(authService.updateRefreshToken).not.toHaveBeenCalled()
	})

	it('returns null when the password does not match', async () => {
		userService.findOneByOptions.mockResolvedValue({
			id: 'user-1',
			email: 'new.user@example.com',
			tenantId: 'tenant-1',
			hash: 'stored-hash'
		})
		jest.spyOn(bcrypt, 'compare').mockResolvedValue(false)

		await expect(
			handler.execute(new AuthLoginCommand({ email: 'new.user@example.com', password: 'wrong-password' }))
		).resolves.toBeNull()

		expect(authService.createToken).not.toHaveBeenCalled()
		expect(authService.updateRefreshToken).not.toHaveBeenCalled()
	})
})
