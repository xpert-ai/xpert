import { ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import {
	GLOBAL_ORGANIZATION_SCOPE,
	ORGANIZATION_METADATA_KEY,
	RequestContext,
	setDefaultTenantId,
	SYSTEM_GLOBAL_SCOPE
} from '@xpert-ai/plugin-sdk'
import { PluginScopeGuard } from './plugin-scope.guard'

describe('PluginScopeGuard', () => {
	const reflector = new Reflector()
	const guard = new PluginScopeGuard(reflector)

	function context(controller: new () => unknown) {
		return {
			getClass: () => controller,
			getHandler: () => controller.prototype['handle']
		} as unknown as ExecutionContext
	}

	function controllerForScope(scopeKey: string) {
		class PluginController {
			handle() {
				return undefined
			}
		}
		Reflect.defineMetadata(ORGANIZATION_METADATA_KEY, scopeKey, PluginController)
		return PluginController
	}

	beforeEach(() => {
		setDefaultTenantId('tenant-default')
		jest.spyOn(RequestContext, 'getScope').mockReturnValue({
			level: RequestScopeLevel.ORGANIZATION,
			tenantId: 'tenant-default',
			organizationId: 'org-default'
		})
	})

	afterEach(() => {
		jest.restoreAllMocks()
		setDefaultTenantId(null)
	})

	it('allows system plugin controllers in every tenant', () => {
		expect(guard.canActivate(context(controllerForScope(SYSTEM_GLOBAL_SCOPE)))).toBe(true)
	})

	it('allows tenant plugin controllers only in the owning tenant', () => {
		jest.spyOn(RequestContext, 'getScope').mockReturnValue({
			level: RequestScopeLevel.ORGANIZATION,
			tenantId: 'tenant-bom',
			organizationId: 'org-bom'
		})
		const controller = controllerForScope('tenant:tenant-bom:global')

		expect(guard.canActivate(context(controller))).toBe(true)

		jest.spyOn(RequestContext, 'getScope').mockReturnValue({
			level: RequestScopeLevel.ORGANIZATION,
			tenantId: 'tenant-other',
			organizationId: 'org-other'
		})
		expect(() => guard.canActivate(context(controller))).toThrow(ForbiddenException)
	})

	it('restricts organization and default-tenant global plugin controllers', () => {
		expect(guard.canActivate(context(controllerForScope('org-default')))).toBe(true)
		expect(() => guard.canActivate(context(controllerForScope('org-other')))).toThrow(ForbiddenException)
		expect(guard.canActivate(context(controllerForScope(GLOBAL_ORGANIZATION_SCOPE)))).toBe(true)

		jest.spyOn(RequestContext, 'getScope').mockReturnValue({
			level: RequestScopeLevel.ORGANIZATION,
			tenantId: 'tenant-other',
			organizationId: 'org-other'
		})
		expect(() => guard.canActivate(context(controllerForScope(GLOBAL_ORGANIZATION_SCOPE)))).toThrow(
			ForbiddenException
		)
	})
})
