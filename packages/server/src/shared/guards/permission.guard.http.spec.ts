jest.mock('../../auth/auth.service', () => ({ AuthService: class AuthService {} }))

import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CommandBus } from '@nestjs/cqrs'
import { AuthGuard } from '@nestjs/passport'
import { Test } from '@nestjs/testing'
import { IUser } from '@xpert-ai/contracts'
import { sign } from 'jsonwebtoken'
import { AuthService } from '../../auth/auth.service'
import { JwtStrategy } from '../../auth/strategies/jwt.strategy'
import { RequestContextMiddleware } from '../../core/context/request-context.middleware'
import { Permissions } from '../decorators/permissions'
import { PermissionGuard } from './permission.guard'

const secret = 'permission-guard-http-test-secret'
const view = 'DATA_SOURCE_VIEW'
const edit = 'DATA_SOURCE_EDIT'

@Controller('permissions')
@UseGuards(AuthGuard('jwt'), PermissionGuard)
class PermissionTestController {
	@Get('view')
	@Permissions(view)
	read() {
		return { allowed: true }
	}

	@Get('edit')
	@Permissions(edit)
	write() {
		return { allowed: true }
	}

	@Get('either')
	@Permissions(view, edit)
	either() {
		return { allowed: true }
	}
}

describe('PermissionGuard with real JWT HTTP authentication', () => {
	let app: INestApplication
	let origin: string
	let viewEnabled: boolean | null
	const getAuthenticatedUser = jest.fn()
	const execute = jest.fn()
	const token = (permissions?: string[] | null) => sign({ id: 'viewer', permissions }, secret, { expiresIn: '1h' })
	const request = (jwt: string, path = 'view') =>
		fetch(`${origin}/permissions/${path}`, { headers: { authorization: `Bearer ${jwt}` } })

	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [PermissionTestController],
			providers: [
				JwtStrategy,
				PermissionGuard,
				{ provide: AuthService, useValue: { getAuthenticatedUser } },
				{ provide: ConfigService, useValue: { get: () => secret } },
				{ provide: CommandBus, useValue: { execute } }
			]
		}).compile()
		app = module.createNestApplication({ logger: false })
		const middleware = new RequestContextMiddleware()
		app.use(middleware.use.bind(middleware))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})

	afterAll(() => app?.close())

	beforeEach(() => {
		viewEnabled = true
		execute.mockReset()
		getAuthenticatedUser.mockReset().mockImplementation(
			async () =>
				({
					id: 'viewer',
					tenantId: 'tenant',
					roleId: 'role',
					role: {
						id: 'role',
						name: 'VIEWER',
						rolePermissions: [
							...(viewEnabled === null
								? []
								: [{ tenantId: 'tenant', roleId: 'role', permission: view, enabled: viewEnabled }]),
							{ tenantId: 'tenant', roleId: 'role', permission: edit, enabled: true }
						]
					}
				}) as IUser
		)
	})

	it('observes revocation, deletion and restoration with the same token on subsequent requests', async () => {
		const jwt = token([view])
		for (const enabled of [true, false, null, true]) {
			viewEnabled = enabled
			expect((await request(jwt)).status).toBe(enabled ? 200 : 403)
		}
		expect(getAuthenticatedUser).toHaveBeenCalledTimes(4)
		expect(getAuthenticatedUser).toHaveBeenLastCalledWith('viewer', undefined)
		expect(execute).not.toHaveBeenCalled()
	})

	it('does not widen a token ceiling through database fallback or an OR alternative', async () => {
		execute.mockResolvedValue(true)
		expect((await request(token([]))).status).toBe(403)
		const jwt = token([view])
		expect((await request(jwt, 'edit')).status).toBe(403)
		expect((await request(jwt, 'either')).status).toBe(200)
		viewEnabled = false
		expect((await request(jwt, 'either')).status).toBe(403)
		expect(execute).not.toHaveBeenCalled()
	})

	it.each([undefined, null])(
		'reloads current permissions for a legacy token with a %s claim',
		async (permissions) => {
			const jwt = token(permissions)
			expect((await request(jwt)).status).toBe(200)
			viewEnabled = false
			expect((await request(jwt)).status).toBe(403)
			expect(getAuthenticatedUser).toHaveBeenCalledTimes(2)
			expect(execute).not.toHaveBeenCalled()
		}
	)
})
