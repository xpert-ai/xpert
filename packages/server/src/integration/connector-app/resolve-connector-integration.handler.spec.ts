jest.mock('@xpert-ai/plugin-sdk', () => ({
	...jest.requireActual('@xpert-ai/plugin-sdk'),
	...jest.requireActual('../../../../plugin-sdk/src/lib/integration/resolve-connector-integration.query')
}))

import { Test } from '@nestjs/testing'
import { CqrsModule } from '@nestjs/cqrs'
import { getRepositoryToken } from '@nestjs/typeorm'
import { Integration } from '../integration.entity'
import { PluginIntegrationPermissionService } from '../../plugin/permissions/integration-permission'
import { IsNull } from 'typeorm'
import { ResolveConnectorIntegrationQuery } from '@xpert-ai/plugin-sdk'
import { ResolveConnectorIntegrationHandler } from './resolve-connector-integration.handler'

describe('Resolve connector integration in persisted scope', () => {
	it('dispatches the plugin capability through the registered host query handler', async () => {
		const application = { id: 'app', provider: 'github', tenantId: 'tenant', organizationId: null }
		const repository = { findOne: jest.fn().mockResolvedValue(application) }
		const module = await Test.createTestingModule({
			imports: [CqrsModule.forRoot()],
			providers: [
				PluginIntegrationPermissionService,
				ResolveConnectorIntegrationHandler,
				{ provide: getRepositoryToken(Integration), useValue: repository }
			]
		}).compile()
		await module.init()
		try {
			await expect(
				module
					.get(PluginIntegrationPermissionService)
					.readForConnector('app', 'github', { tenantId: 'tenant', organizationId: null })
			).resolves.toBe(application)
			expect(repository.findOne).toHaveBeenCalled()
		} finally {
			await module.close()
		}
	})

	it('constrains a public callback to the exact provider, tenant and inherited organization scope', async () => {
		const repository = { findOne: jest.fn().mockResolvedValue(null) }
		const handler = new ResolveConnectorIntegrationHandler(repository)
		await expect(
			handler.execute(
				new ResolveConnectorIntegrationQuery('app', 'github', { tenantId: 'tenant', organizationId: 'org' })
			)
		).resolves.toBeNull()
		expect(repository.findOne).toHaveBeenCalledWith({
			where: [
				{ id: 'app', provider: 'github', tenantId: 'tenant', organizationId: IsNull() },
				{ id: 'app', provider: 'github', tenantId: 'tenant', organizationId: 'org' }
			]
		})
	})
	it('never broadens a tenant callback to organization applications', async () => {
		const repository = { findOne: jest.fn().mockResolvedValue(null) }
		const handler = new ResolveConnectorIntegrationHandler(repository)
		await handler.execute(
			new ResolveConnectorIntegrationQuery('app', 'github', { tenantId: 'tenant', organizationId: null })
		)
		expect(repository.findOne).toHaveBeenCalledWith({
			where: [{ id: 'app', provider: 'github', tenantId: 'tenant', organizationId: IsNull() }]
		})
	})
})
