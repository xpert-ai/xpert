import 'reflect-metadata'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { TenantAdminCliModule } from './tenant-admin-cli.module'

jest.mock('@xpert-ai/server-core', () => {
	const { EventEmitterModule } = jest.requireActual('@nestjs/event-emitter')

	return {
		DatabaseModule: class DatabaseModule {},
		Role: class Role {},
		Tenant: class Tenant {},
		TenantService: class TenantService {},
		UserService: class UserService {},
		provideEventEmitterModule: () => ({ module: EventEmitterModule })
	}
})

describe('TenantAdminCliModule', () => {
	function getImportedModuleNames() {
		const imports = Reflect.getMetadata('imports', TenantAdminCliModule) ?? []

		return imports.map((item: { module?: { name?: string }; name?: string }) => item?.module?.name ?? item?.name)
	}

	it('keeps the tenant CLI context scoped to tenant service dependencies', () => {
		const importedModuleNames = getImportedModuleNames()

		expect(importedModuleNames).toContain('DatabaseModule')
		expect(importedModuleNames).toContain(EventEmitterModule.name)
		expect(importedModuleNames).not.toContain('ServerAppModule')
	})
})
