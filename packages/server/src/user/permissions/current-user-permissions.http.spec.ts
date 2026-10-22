jest.mock('../../auth/auth.service', () => ({ AuthService: class AuthService {} }))
jest.mock('../../api-key/api-key.service', () => ({ ApiKeyService: class ApiKeyService {} }))

import { Controller, Get, INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CqrsModule } from '@nestjs/cqrs'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { ApiKeyBindingType, PermissionsEnum, RolesEnum, UserType } from '@xpert-ai/contracts'
import { RequestContextMiddleware } from '@xpert-ai/plugin-sdk'
import { sign } from 'jsonwebtoken'
import { AuthService } from '../../auth/auth.service'
import { JwtStrategy } from '../../auth/strategies/jwt.strategy'
import { BasicStrategy } from '../../auth/strategies/basic.strategy'
import { ApiKeyStrategy } from '../../api-key/api-key.strategy'
import { ApiKeyService } from '../../api-key/api-key.service'
import { ApiKey } from '../../api-key/api-key.entity'
import { RequestContextMiddleware as LegacyContextMiddleware } from '../../core/context/request-context.middleware'
import { AuthGuard } from '../../shared/guards/auth.guard'
import { AuthStrategies } from '../../shared/decorators/auth-strategies.decorator'
import { Organization } from '../../organization/organization.entity'
import { RolePermissionController } from '../../role-permission/role-permission.controller'
import { RolePermissionService } from '../../role-permission/role-permission.service'
import { RolePermission } from '../../role-permission/role-permission.entity'
import { Role } from '../../role/role.entity'
import { UserOrganization } from '../../user-organization/user-organization.entity'
import { ResolveUserOrganizationAccessHandler } from '../../user-organization/commands/handlers/resolve-user-organization-access.handler'
import { User } from '../user.entity'
import { CurrentUserPermissionsController } from './current-user-permissions.controller'
import { CurrentUserPermissionsService } from './current-user-permissions.service'

const secret = 'effective-permissions-http-test-only'
const view = PermissionsEnum.BUSINESS_AREA_VIEW
const assign = PermissionsEnum.BUSINESS_AREA_ASSIGN

@AuthStrategies('jwt', 'basic', 'api-key')
@Controller('authentication-control')
class AuthenticationControlController {
	@Get()
	get() {
		return { authenticated: true }
	}
}

describe('current request permissions through real authentication and scope checks', () => {
	let app: INestApplication
	let origin: string
	let user: User
	let memberActive: boolean
	let organizationActive: boolean
	const getAuthenticatedUser = jest.fn()
	const validateUser = jest.fn()
	const resolvePrincipal = jest.fn()
	let apiKeyStrategy: ApiKeyStrategy
	const findAll = jest.fn()
	const users = { findOne: jest.fn() }
	const memberships = { findOne: jest.fn() }
	const organizations = { findOne: jest.fn() }
	const grant = (permission: string, enabled = true, tenantId = 'tenant', roleId = 'role') =>
		Object.assign(new RolePermission(), { permission, enabled, tenantId, roleId })
	const token = (permissions?: string[] | null) => sign({ id: 'viewer', permissions }, secret, { expiresIn: '1h' })
	const request = (jwt = token(), headers: Record<string, string> = {}, path = '/me/permissions') =>
		fetch(`${origin}/api/user${path}`, {
			headers: {
				authorization: `Bearer ${jwt}`,
				'tenant-id': 'tenant',
				'organization-id': 'org',
				'x-scope-level': 'organization',
				...headers
			}
		})

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			imports: [CqrsModule],
			// The real administrative controller is mounted alongside the self controller.
			controllers: [CurrentUserPermissionsController, AuthenticationControlController, RolePermissionController],
			providers: [
				JwtStrategy,
				BasicStrategy,
				ApiKeyStrategy,
				CurrentUserPermissionsService,
				ResolveUserOrganizationAccessHandler,
				{ provide: AuthService, useValue: { getAuthenticatedUser, validateUser } },
				{ provide: ApiKeyService, useValue: { resolvePrincipal } },
				{ provide: ConfigService, useValue: { get: () => secret } },
				{ provide: RolePermissionService, useValue: { findAll } },
				{ provide: getRepositoryToken(User), useValue: users },
				{ provide: getRepositoryToken(UserOrganization), useValue: memberships },
				{ provide: getRepositoryToken(Organization), useValue: organizations }
			]
		}).compile()
		apiKeyStrategy = module.get(ApiKeyStrategy)
		app = module.createNestApplication({ logger: false })
		app.setGlobalPrefix('api/user')
		for (const middleware of [new LegacyContextMiddleware(), new RequestContextMiddleware()]) {
			app.use(middleware.use.bind(middleware))
		}
		app.useGlobalGuards(new AuthGuard(module.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})

	afterAll(async () => {
		await app?.close()
	})
	beforeEach(() => {
		jest.clearAllMocks()
		memberActive = true
		organizationActive = true
		user = Object.assign(new User(), {
			id: 'viewer',
			tenantId: 'tenant',
			type: UserType.USER,
			roleId: 'role',
			role: Object.assign(new Role(), {
				id: 'role',
				name: RolesEnum.VIEWER,
				rolePermissions: [grant(view), grant(assign), grant(PermissionsEnum.CHANGE_ROLES_PERMISSIONS, false)]
			})
		})
		getAuthenticatedUser.mockImplementation(async (id: string) => (id === user.id ? structuredClone(user) : null))
		validateUser.mockResolvedValue(user)
		resolvePrincipal.mockResolvedValue(user)
		jest.spyOn(apiKeyStrategy, 'validateToken').mockResolvedValue(
			Object.assign(new ApiKey(), {
				type: ApiKeyBindingType.WORKSPACE,
				createdBy: user
			})
		)
		users.findOne.mockImplementation(async ({ where }) =>
			where.id === user.id && where.tenantId === user.tenantId ? structuredClone(user) : null
		)
		memberships.findOne.mockImplementation(async ({ where }) =>
			memberActive &&
			organizationActive &&
			where.userId === user.id &&
			where.tenantId === 'tenant' &&
			where.organizationId === 'org' &&
			where.isActive &&
			where.organization.tenantId === 'tenant' &&
			where.organization.isActive
				? { isActive: true }
				: null
		)
		organizations.findOne.mockImplementation(async ({ where }) =>
			organizationActive && where.id === 'org' && where.tenantId === 'tenant' && where.isActive
				? { id: 'org' }
				: null
		)
	})

	it('lets VIEWER inspect capabilities while the real role-management controller remains forbidden', async () => {
		const response = await request()
		expect(response.status).toBe(200)
		expect(response.headers.get('cache-control')).toBe('no-store')
		expect(await response.json()).toEqual([assign, view])
		const admin = await request(
			token(),
			{},
			'?data=' + encodeURIComponent(JSON.stringify({ findInput: { tenantId: 'tenant', roleId: 'role' } }))
		)
		expect(admin.status).toBe(403)
		expect(findAll).not.toHaveBeenCalled()
	})

	it('preserves JWT token ceilings including an explicit empty list', async () => {
		for (const permissions of [[], [view]]) {
			const response = await request(token(permissions))
			expect(response.status).toBe(200)
			expect(await response.json()).toEqual(permissions)
		}
		user.role.rolePermissions[0].enabled = false
		expect(await (await request(token([view]))).json()).toEqual([])
	})

	it('observes revocation, deletion and restoration with the same token', async () => {
		const jwt = token([view])
		for (const grants of [[grant(view)], [grant(view, false)], [], [grant(view)]]) {
			user.role.rolePermissions = grants
			expect(await (await request(jwt)).json()).toEqual(grants[0]?.enabled ? [view] : [])
		}
		expect(getAuthenticatedUser).toHaveBeenCalledTimes(4)
	})

	it('filters grants from another tenant or role and gives an explicit deny precedence', async () => {
		user.role.rolePermissions = [
			grant(view, true, 'other'),
			grant(assign, true, 'tenant', 'other'),
			grant(view),
			grant(view, false)
		]
		expect(await (await request()).json()).toEqual([])
	})

	it.each([RolesEnum.ADMIN, RolesEnum.SUPER_ADMIN, RolesEnum.TRIAL])(
		'does not grant %s a permission absent from its effective grants',
		async (role) => {
			user.role.name = role
			expect(await (await request(token([]))).json()).toEqual([])
		}
	)

	it.each([{ 'tenant-id': 'other' }, { 'organization-id': 'other' }])(
		'rejects scope outside the authenticated tenant and memberships: %j',
		async (headers) => {
			expect((await request(token(), headers)).status).toBe(403)
		}
	)

	it('checks live membership and organization activation on subsequent requests', async () => {
		const jwt = token()
		expect((await request(jwt)).status).toBe(200)
		memberActive = false
		expect((await request(jwt)).status).toBe(403)
		memberActive = true
		organizationActive = false
		expect((await request(jwt)).status).toBe(403)
	})

	it('supports tenant scope and rejects malformed scope headers', async () => {
		expect((await request(token(), { 'organization-id': '', 'x-scope-level': 'tenant' })).status).toBe(200)
		expect((await request(token(), { 'x-scope-level': 'tenant' })).status).toBe(400)
		expect((await request(token(), { 'organization-id': '' })).status).toBe(400)
	})

	it('cannot select another identity or role through query parameters', async () => {
		expect(
			await (await request(token([view]), {}, '/me/permissions?userId=admin&roleId=admin&tenantId=other')).json()
		).toEqual([view])
		expect(getAuthenticatedUser).toHaveBeenLastCalledWith('viewer', undefined)
	})

	it('rejects unauthenticated, invalid and expired credentials', async () => {
		expect((await fetch(`${origin}/api/user/me/permissions`)).status).toBe(401)
		for (const jwt of ['', 'invalid', sign({ id: 'viewer' }, secret, { expiresIn: -1 })]) {
			expect((await request(jwt)).status).toBe(401)
		}
	})

	it.each(['authorization', 'x-api-key'])(
		'rejects a valid resource API key via %s without invoking the API-key strategy',
		async (header) => {
			const headers = { [header]: header === 'authorization' ? 'Bearer resource-key' : 'resource-key' }
			expect((await fetch(`${origin}/api/user/authentication-control`, { headers })).status).toBe(200)
			expect(apiKeyStrategy.validateToken).toHaveBeenCalledWith('resource-key')
			jest.clearAllMocks()
			expect((await fetch(`${origin}/api/user/me/permissions`, { headers })).status).toBe(401)
			expect(apiKeyStrategy.validateToken).not.toHaveBeenCalled()
			expect(resolvePrincipal).not.toHaveBeenCalled()
			expect(getAuthenticatedUser).not.toHaveBeenCalled()
		}
	)

	it('rejects valid Basic credentials and does not authenticate through Basic', async () => {
		const headers = { authorization: `Basic ${Buffer.from('viewer:password').toString('base64')}` }
		expect((await fetch(`${origin}/api/user/authentication-control`, { headers })).status).toBe(200)
		expect(validateUser).toHaveBeenCalledTimes(1)
		validateUser.mockClear()
		expect((await fetch(`${origin}/api/user/me/permissions`, { headers })).status).toBe(401)
		expect(validateUser).not.toHaveBeenCalled()
	})

	it('authenticates JWT through the global guard exactly once', async () => {
		const response = await request(token([view]))
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual([view])
		expect(getAuthenticatedUser).toHaveBeenCalledTimes(1)
		expect(apiKeyStrategy.validateToken).not.toHaveBeenCalled()
		expect(Reflect.getMetadata('isPublic', CurrentUserPermissionsController.prototype.get)).toBeUndefined()
		expect(Reflect.getMetadata('__guards__', CurrentUserPermissionsController.prototype.get)).toBeUndefined()
	})

	it('does not treat unavailable authentication grants as an empty authorized response', async () => {
		user.role.rolePermissions = undefined
		expect((await request()).status).toBe(503)
		Object.assign(user, { roleId: undefined })
		expect((await request()).status).toBe(403)
	})
})
