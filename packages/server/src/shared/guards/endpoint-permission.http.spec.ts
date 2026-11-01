import {
	CanActivate,
	Controller,
	ExecutionContext,
	Get,
	INestApplication,
	Injectable,
	UnauthorizedException,
	UseGuards
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { AIPermissionsEnum, IUser, RolesEnum } from '@xpert-ai/contracts'
import { Permissions } from '../decorators/permissions'
import { Public } from '../decorators/public.decorator'
import { EndpointPermissionInterceptor } from './endpoint-permission.interceptor'

@Injectable()
class RuntimeAuthentication implements CanActivate {
	constructor(private readonly reflector: Reflector) {}

	canActivate(context: ExecutionContext) {
		const request = context
			.switchToHttp()
			.getRequest<{ headers: Record<string, string | undefined>; user?: Partial<IUser> }>()
		if (request.headers['x-anonymous']) {
			if (this.reflector.getAllAndOverride<boolean>('isPublic', [context.getHandler(), context.getClass()]))
				return true
			throw new UnauthorizedException()
		}
		if (request.headers['x-disabled'] === 'true') throw new UnauthorizedException()
		request.user = {
			id: 'user',
			tenantId: 'tenant',
			roleId: 'role',
			isActive: request.headers['x-disabled'] !== 'true',
			role: {
				id: 'role',
				name: request.headers.authorization ?? RolesEnum.APP_USER,
				rolePermissions: [
					AIPermissionsEnum.CHAT_VIEW,
					...(request.headers['x-author'] ? [AIPermissionsEnum.XPERT_EDIT] : [])
				].map((permission) => ({
					tenantId: request.headers['x-foreign-grant'] ? 'foreign' : 'tenant',
					roleId: request.headers['x-foreign-role'] ? 'foreign' : 'role',
					role: { id: 'role', name: 'custom' },
					permission,
					enabled: request.headers['x-revoked'] !== 'true'
				}))
			}
		}
		return true
	}
}
class CrudParent {
	@Get('inherited') read() {
		return { private: true }
	}
}
@Controller('policy')
@Permissions(AIPermissionsEnum.XPERT_EDIT)
class FixtureController extends CrudParent {
	@Get('configuration') configuration() {
		return { private: true }
	}
	@Permissions(AIPermissionsEnum.CHAT_VIEW)
	@Get('chat')
	chat() {
		return { business: true }
	}
	@Public()
	@Permissions(AIPermissionsEnum.CHAT_VIEW)
	@Get('public')
	public() {
		return { public: true }
	}
	@Permissions()
	@Get('empty')
	empty() {
		return { private: true }
	}
	@Permissions(AIPermissionsEnum.XPERT_EDIT, AIPermissionsEnum.CHAT_VIEW)
	@Get('any')
	any() {
		return { business: true }
	}
}
@Controller('undeclared')
class UndeclaredController {
	@Get() read() {
		return { private: true }
	}
}
@Controller('account')
class AccountController {
	@Get()
	account() {
		return { self: true }
	}

	@Permissions(AIPermissionsEnum.XPERT_EDIT)
	@Get('configuration')
	configuration() {
		return { private: true }
	}
}

@Injectable()
class RouteAuthentication implements CanActivate {
	canActivate(context: ExecutionContext) {
		const request = context.switchToHttp().getRequest<{ user?: Partial<IUser> }>()
		request.user = {
			id: 'client-secret-user',
			tenantId: 'tenant',
			roleId: 'role',
			role: {
				id: 'role',
				name: 'custom',
				rolePermissions: [
					{
						tenantId: 'tenant',
						roleId: 'role',
						role: { id: 'role', name: 'custom' },
						permission: AIPermissionsEnum.CHAT_VIEW,
						enabled: true
					}
				]
			}
		}
		return true
	}
}

@Public()
@UseGuards(RouteAuthentication)
@Controller('runtime')
class RuntimeController {
	@Get('chat')
	@Permissions(AIPermissionsEnum.CHAT_VIEW)
	chat() {
		return { business: true }
	}

	@Get('configuration')
	@Permissions(AIPermissionsEnum.XPERT_EDIT)
	configuration() {
		return { private: true }
	}
}

describe('role-independent HTTP permissions after authentication', () => {
	let app: INestApplication
	let origin: string
	beforeAll(async () => {
		const module = await Test.createTestingModule({
			controllers: [FixtureController, UndeclaredController, AccountController, RuntimeController],
			providers: [RuntimeAuthentication, RouteAuthentication]
		}).compile()
		app = module.createNestApplication()
		app.useGlobalGuards(module.get(RuntimeAuthentication))
		app.useGlobalInterceptors(new EndpointPermissionInterceptor(module.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	afterAll(() => app.close())
	it.each([RolesEnum.APP_USER, RolesEnum.ADMIN, 'BID_CUSTOMER'])(
		'applies the same grants to %s',
		async (authorization) => {
			const headers = { authorization }
			expect((await fetch(`${origin}/policy/chat`, { headers })).status).toBe(200)
			expect((await fetch(`${origin}/policy/configuration`, { headers })).status).toBe(403)
			expect((await fetch(`${origin}/policy/inherited`, { headers })).status).toBe(403)
			expect((await fetch(`${origin}/undeclared`, { headers })).status).toBe(200)
			expect(
				(await fetch(`${origin}/policy/inherited`, { headers: { ...headers, 'x-author': 'true' } })).status
			).toBe(200)
		}
	)
	it('checks management method permissions without restricting self-service on the same controller', async () => {
		expect((await fetch(`${origin}/account`)).status).toBe(200)
		expect((await fetch(`${origin}/account/configuration`)).status).toBe(403)
		expect((await fetch(`${origin}/account/configuration`, { headers: { 'x-author': 'true' } })).status).toBe(200)
	})
	it.each(['x-revoked', 'x-foreign-grant', 'x-foreign-role'])(
		'rejects live %s with the same authenticated principal',
		async (header) => {
			expect((await fetch(`${origin}/policy/chat`)).status).toBe(200)
			expect((await fetch(`${origin}/policy/chat`, { headers: { [header]: 'true' } })).status).toBe(403)
			expect((await fetch(`${origin}/policy/chat`)).status).toBe(200)
		}
	)
	it('retains identity-only account access when chat permission is revoked, but rejects a disabled account', async () => {
		expect((await fetch(`${origin}/account`, { headers: { 'x-revoked': 'true' } })).status).toBe(200)
		expect((await fetch(`${origin}/account`, { headers: { 'x-disabled': 'true' } })).status).toBe(401)
	})
	it('permits anonymous public access while checking authenticated public requests', async () => {
		expect((await fetch(`${origin}/policy/public`, { headers: { 'x-anonymous': 'true' } })).status).toBe(200)
		expect((await fetch(`${origin}/policy/public`, { headers: { 'x-revoked': 'true' } })).status).toBe(403)
		expect((await fetch(`${origin}/policy/public`, { headers: { 'x-disabled': 'true' } })).status).toBe(401)
	})
	it('requires authentication for protected and identity-only endpoints', async () => {
		const headers = { 'x-anonymous': 'true' }
		expect((await fetch(`${origin}/policy/chat`, { headers })).status).toBe(401)
		expect((await fetch(`${origin}/account`, { headers })).status).toBe(401)
		expect((await fetch(`${origin}/undeclared`, { headers })).status).toBe(401)
	})
	it('uses any-of grants and denies empty permission declarations', async () => {
		expect((await fetch(`${origin}/policy/any`)).status).toBe(200)
		expect((await fetch(`${origin}/policy/any`, { headers: { 'x-revoked': 'true' } })).status).toBe(403)
		expect((await fetch(`${origin}/policy/empty`, { headers: { 'x-author': 'true' } })).status).toBe(403)
	})
	it('checks permissions after route-local authentication of public runtime entry points', async () => {
		const headers = { 'x-anonymous': 'true' }
		expect((await fetch(`${origin}/runtime/chat`, { headers })).status).toBe(200)
		expect((await fetch(`${origin}/runtime/configuration`, { headers })).status).toBe(403)
	})
})
