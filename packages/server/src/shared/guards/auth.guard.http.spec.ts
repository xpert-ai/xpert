import { Controller, Get, INestApplication, Req, SetMetadata } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import type { IncomingMessage } from 'node:http'
import { Strategy } from 'passport'
import { PassportStrategy } from '@nestjs/passport'
import { AUTH_STRATEGIES_METADATA, AuthStrategies } from '../decorators/auth-strategies.decorator'
import { Public } from '../decorators/public.decorator'
import { AuthGuard } from './auth.guard'

const attempts = jest.fn()
class TestStrategy extends Strategy {
	constructor(private readonly family: string) {
		super()
	}
	authenticate(req: IncomingMessage, options: { allowPersonalApiKey?: boolean }) {
		attempts(this.family, options.allowPersonalApiKey)
		setImmediate(() => {
			if (req.headers.authorization === this.family) this.success({ id: this.family })
			else this.fail(401)
		})
	}
}

@Controller('default')
class DefaultController {
	@Get()
	get(@Req() request: { user: { id: string } }) {
		return request.user
	}

	@Public()
	@Get('public')
	public() {
		return { public: true }
	}

	@AuthStrategies('jwt', 'api-key')
	@Get('restricted')
	restricted(@Req() request: { user: { id: string } }) {
		return request.user
	}

	@SetMetadata(AUTH_STRATEGIES_METADATA, [])
	@Get('empty')
	empty() {
		return { allowed: true }
	}
}

@AuthStrategies('api-key')
@Controller('scoped')
class ScopedController {
	@Get()
	get() {
		return { allowed: true }
	}

	@AuthStrategies('jwt')
	@Get('override')
	override() {
		return { allowed: true }
	}

	@Public()
	@Get('public-conflict')
	conflict() {
		return { allowed: true }
	}
}

@Public()
@Controller('public')
class PublicController {
	@AuthStrategies('jwt')
	@Get('restricted')
	get() {
		return { allowed: true }
	}
}

describe('global authentication strategy metadata', () => {
	let app: INestApplication
	let origin: string
	const families = ['jwt', 'basic', 'api-key']
	const defaults = ['jwt', 'basic']
	const request = (path: string, family?: string) =>
		fetch(`${origin}/${path}`, {
			headers: family ? { authorization: family } : {}
		})
	beforeAll(async () => {
		for (const name of families) {
			class RegisteredStrategy extends PassportStrategy(TestStrategy, name) {
				validate() {
					return { id: name }
				}
			}
			new RegisteredStrategy(name)
		}
		const module = await Test.createTestingModule({
			controllers: [DefaultController, ScopedController, PublicController]
		}).compile()
		app = module.createNestApplication({ logger: false })
		app.useGlobalGuards(new AuthGuard(module.get(Reflector)))
		await app.listen(0, '127.0.0.1')
		origin = await app.getUrl()
	})
	beforeEach(() => attempts.mockClear())
	afterAll(async () => {
		await app?.close()
	})

	it.each(defaults)('preserves the default strategy order for %s', async (family) => {
		expect((await request('default', family)).status).toBe(200)
		expect(attempts.mock.calls).toEqual(
			defaults.slice(0, defaults.indexOf(family) + 1).map((name) => [name, undefined])
		)
	})
	it('does not add API-key authentication to the default policy', async () => {
		expect((await request('default', 'api-key')).status).toBe(401)
		expect(attempts.mock.calls).toEqual([
			['jwt', undefined],
			['basic', undefined]
		])
	})
	it('preserves anonymous Public routes without running authentication', async () => {
		expect((await request('default/public')).status).toBe(200)
		expect(attempts).not.toHaveBeenCalled()
	})
	it.each(['jwt', 'api-key'])('authenticates %s once on an explicitly restricted route', async (family) => {
		const response = await request('default/restricted', family)
		expect(response.status).toBe(200)
		expect(await response.json()).toEqual({ id: family })
		expect(attempts.mock.calls).toEqual(
			family === 'jwt'
				? [['jwt', undefined]]
				: [
						['jwt', undefined],
						['api-key', undefined]
					]
		)
	})
	it.each([undefined, 'basic'])('never falls back to defaults for excluded credentials: %s', async (family) => {
		expect((await request('default/restricted', family)).status).toBe(401)
		expect(attempts.mock.calls).toEqual([
			['jwt', undefined],
			['api-key', undefined]
		])
	})
	it('uses method strategies in place of class strategies', async () => {
		expect((await request('scoped', 'api-key')).status).toBe(200)
		expect((await request('scoped', 'jwt')).status).toBe(401)
		expect((await request('scoped/override', 'api-key')).status).toBe(401)
		expect((await request('scoped/override', 'jwt')).status).toBe(200)
	})
	it.each(['scoped/public-conflict', 'public/restricted'])(
		'explicit authentication wins over Public on %s',
		async (path) => {
			expect((await request(path)).status).toBe(401)
		}
	)
	it('fails closed for an empty strategy declaration', async () => {
		expect((await request('default/empty', 'jwt')).status).toBe(401)
		expect(attempts).not.toHaveBeenCalled()
	})
	it('keeps strategy selection isolated between concurrent requests', async () => {
		const responses = await Promise.all([
			request('default', 'api-key'),
			request('scoped', 'jwt'),
			request('default/restricted', 'basic'),
			request('scoped/override', 'jwt'),
			request('default/restricted', 'api-key')
		])
		expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 200, 200])
	})
})
