import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { IApiPrincipal, SecretTokenBindingType } from '@xpert-ai/contracts'
import {
	ALLOWED_CLIENT_SECRET_BINDINGS_METADATA,
	AllowClientSecretBindings
} from '../decorators/allowed-client-secret-bindings.decorator'
import { ApiKeyOrClientSecretAuthGuard } from './api-key-or-client-secret.guard'

describe('ApiKeyOrClientSecretAuthGuard', () => {
	const reflector = new Reflector()

	function context(principal: IApiPrincipal, allowEnterprise = false) {
		class TestController {
			handle() {
				return undefined
			}
		}

		if (allowEnterprise) {
			AllowClientSecretBindings(SecretTokenBindingType.ENTERPRISE_XPERT)(
				TestController.prototype,
				'handle',
				Object.getOwnPropertyDescriptor(TestController.prototype, 'handle')!
			)
		}

		const request = {
			headers: { authorization: 'Bearer cs-x-test' },
			user: principal
		}

		return {
			context: {
				getClass: () => TestController,
				getHandler: () => TestController.prototype.handle,
				switchToHttp: () => ({ getRequest: () => request })
			} as unknown as ExecutionContext,
			request
		}
	}

	class TestGuard extends ApiKeyOrClientSecretAuthGuard {
		protected override authenticateClientSecret() {
			return true
		}
	}

	function principal(bindingType: SecretTokenBindingType): IApiPrincipal {
		return {
			id: 'user-1',
			principalType: 'client_secret',
			clientSecretBindingType: bindingType
		} as IApiPrincipal
	}

	it('denies enterprise Xpert secrets on controllers without explicit authorization', async () => {
		const guard = new TestGuard(reflector)
		const { context: executionContext } = context(principal(SecretTokenBindingType.ENTERPRISE_XPERT))

		await expect(guard.canActivate(executionContext)).rejects.toBeInstanceOf(ForbiddenException)
	})

	it('allows enterprise Xpert secrets only on explicitly authorized controllers', async () => {
		const guard = new TestGuard(reflector)
		const { context: executionContext } = context(principal(SecretTokenBindingType.ENTERPRISE_XPERT), true)

		await expect(guard.canActivate(executionContext)).resolves.toBe(true)
	})

	it('preserves existing client-secret behavior for other binding types', async () => {
		const guard = new TestGuard(reflector)
		const { context: executionContext } = context(principal(SecretTokenBindingType.PUBLIC_XPERT))

		await expect(guard.canActivate(executionContext)).resolves.toBe(true)
	})

	it('stores the allowed binding metadata on the decorated handler', () => {
		const { context: executionContext } = context(principal(SecretTokenBindingType.ENTERPRISE_XPERT), true)

		expect(
			reflector.get<SecretTokenBindingType[]>(
				ALLOWED_CLIENT_SECRET_BINDINGS_METADATA,
				executionContext.getHandler()
			)
		).toEqual([SecretTokenBindingType.ENTERPRISE_XPERT])
	})
})
