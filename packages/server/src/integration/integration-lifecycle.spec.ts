import 'reflect-metadata'
import { BadRequestException } from '@nestjs/common'
import { DiscoveryService, ModulesContainer, Reflector } from '@nestjs/core'
import { CommandBus } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { IntegrationStrategyRegistry, RequestContext, type IntegrationStrategy } from '@xpert-ai/plugin-sdk'
import { BUILTIN_GLOBAL_SCOPE, getTenantGlobalScopeKey, setDefaultTenantId } from '../../../plugin-sdk/src/lib/types'
import { UserService } from '../user'
import { IntegrationDelCommand } from './commands/delete.command'
import { IntegrationUpsertCommand } from './commands/upsert.command'
import { IntegrationDelHandler } from './commands/handlers/delete.handler'
import { IntegrationUpsertHandler } from './commands/handlers/upsert.handler'
import { Integration } from './integration.entity'
import { IntegrationService } from './integration.service'

jest.mock('@xpert-ai/plugin-sdk', () => ({
	...jest.requireActual('../../../plugin-sdk/src/lib/core/context'),
	...jest.requireActual('../../../plugin-sdk/src/lib/integration/strategy.registry')
}))
jest.mock('../core/crud', () => ({
	TenantOrganizationAwareCrudService: class {
		findOne = jest.fn()
		create = jest.fn()
		update = jest.fn()
		delete = jest.fn()
	}
}))
jest.mock('../user', () => ({ UserService: class UserService {} }))
jest.mock('./integration.entity', () => ({ Integration: class Integration {} }))

describe('Integration lifecycle', () => {
	let registry: IntegrationStrategyRegistry
	let service: IntegrationService
	let remove: IntegrationDelHandler
	let upsert: IntegrationUpsertHandler
	let previous: Integration

	beforeEach(async () => {
		setDefaultTenantId('default-tenant')
		jest.spyOn(RequestContext, 'getScope').mockReturnValue({
			tenantId: 'tenant',
			level: RequestScopeLevel.TENANT,
			organizationId: null
		})
		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
		registry = new IntegrationStrategyRegistry(new DiscoveryService(new ModulesContainer()), new Reflector())
		const module = await Test.createTestingModule({
			providers: [
				IntegrationService,
				IntegrationDelHandler,
				IntegrationUpsertHandler,
				{ provide: IntegrationStrategyRegistry, useValue: registry },
				{ provide: getRepositoryToken(Integration), useValue: {} },
				{ provide: UserService, useValue: {} },
				{ provide: CommandBus, useValue: {} }
			]
		}).compile()
		service = module.get(IntegrationService)
		remove = module.get(IntegrationDelHandler)
		upsert = module.get(IntegrationUpsertHandler)
		previous = Object.assign(new Integration(), {
			id: 'integration',
			name: 'GitHub',
			provider: 'github',
			slug: 'github',
			tenantId: 'tenant',
			organizationId: null
		})
		jest.spyOn(service, 'findOne').mockResolvedValue(previous)
	})

	afterEach(() => {
		jest.restoreAllMocks()
		setDefaultTenantId(null)
	})

	function register(hooks: Partial<IntegrationStrategy> = {}, provider = 'github') {
		const strategy: IntegrationStrategy = {
			meta: { name: provider, label: { en_US: 'Test integration' } },
			execute: jest.fn(),
			...hooks
		}
		registry.register(provider, strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
		return strategy
	}

	it.each(['github', 'provider-without-strategy'])(
		'deletes a %s integration with no registered strategy',
		async (provider) => {
			previous.provider = provider
			await expect(remove.execute(new IntegrationDelCommand(previous.id))).resolves.toBeUndefined()
			expect(service.delete).toHaveBeenCalledWith(previous.id)
		}
	)

	it.each(['github', 'provider-without-strategy'])(
		'creates a %s integration without an optional validation strategy',
		async (provider) => {
			await upsert.execute(new IntegrationUpsertCommand({ name: 'Integration', provider }))
			expect(service.create).toHaveBeenCalledWith({ name: 'Integration', provider })
		}
	)

	it('does not treat a registry failure as an absent optional validation strategy', async () => {
		jest.spyOn(RequestContext, 'getScope').mockImplementation(() => {
			throw new Error('Scope unavailable')
		})
		await expect(
			upsert.execute(new IntegrationUpsertCommand({ name: 'GitHub', provider: 'github' }))
		).rejects.toThrow('Scope unavailable')
		expect(service.create).not.toHaveBeenCalled()
	})

	it.each(['github', 'provider-without-strategy'])(
		'updates a %s integration with no registered strategy',
		async (provider) => {
			previous.provider = provider
			await upsert.execute(new IntegrationUpsertCommand({ id: previous.id, name: 'Renamed' }))
			expect(service.update).toHaveBeenCalledWith(previous.id, expect.objectContaining({ name: 'Renamed' }))
		}
	)

	it('allows changing provider when the previous provider has no strategy', async () => {
		register({}, 'replacement')
		await upsert.execute(new IntegrationUpsertCommand({ id: previous.id, provider: 'replacement' }))
		expect(service.update).toHaveBeenCalledWith(previous.id, expect.objectContaining({ provider: 'replacement' }))
	})

	it('supports registered strategies without optional lifecycle hooks', async () => {
		register()
		await remove.execute(new IntegrationDelCommand(previous.id))
		await upsert.execute(new IntegrationUpsertCommand({ id: previous.id, name: 'Renamed' }))
		expect(service.delete).toHaveBeenCalledTimes(1)
		expect(service.update).toHaveBeenCalledTimes(1)
	})

	it('awaits the delete hook before deleting the record', async () => {
		let finish: () => void = () => undefined
		const cleanup = new Promise<void>((resolve) => {
			finish = resolve
		})
		const onDelete = jest.fn(() => cleanup)
		register({ onDelete })
		const operation = remove.execute(new IntegrationDelCommand(previous.id))
		await Promise.resolve()
		expect(onDelete).toHaveBeenCalledWith(previous)
		expect(service.delete).not.toHaveBeenCalled()
		finish()
		await operation
		expect(service.delete).toHaveBeenCalledWith(previous.id)
	})

	it('preserves delete hook failures and leaves the record intact', async () => {
		register({ onDelete: jest.fn().mockRejectedValue(new Error('Cleanup failed')) })
		await expect(remove.execute(new IntegrationDelCommand(previous.id))).rejects.toThrow(
			new BadRequestException('Cleanup failed')
		)
		expect(service.delete).not.toHaveBeenCalled()
	})

	it('validates the new configuration and invokes the update hook before persistence', async () => {
		const onUpdate = jest.fn()
		register({ validateConfig: jest.fn().mockResolvedValue({ name: 'Validated' }), onUpdate })
		await upsert.execute(new IntegrationUpsertCommand({ id: previous.id, name: 'Renamed' }))
		expect(onUpdate).toHaveBeenCalledWith(previous, expect.objectContaining({ name: 'Validated' }))
		expect(service.update).toHaveBeenCalledWith(previous.id, expect.objectContaining({ name: 'Validated' }))
	})

	it.each(['update', 'provider change'])('preserves %s hook failures before persistence', async (operation) => {
		const fail = jest.fn().mockRejectedValue(new Error('Hook failed'))
		register({ onUpdate: fail, onDelete: fail })
		register({}, 'replacement')
		const input = operation === 'update' ? { name: 'Renamed' } : { provider: 'replacement' }
		await expect(upsert.execute(new IntegrationUpsertCommand({ id: previous.id, ...input }))).rejects.toThrow(
			new BadRequestException('Hook failed')
		)
		expect(service.update).not.toHaveBeenCalled()
	})

	it('cleans up the previous provider instead of running its update hook when the provider changes', async () => {
		const onDelete = jest.fn()
		const onUpdate = jest.fn()
		register({ onDelete, onUpdate })
		register({}, 'replacement')
		await upsert.execute(new IntegrationUpsertCommand({ id: previous.id, provider: 'replacement' }))
		expect(onDelete).toHaveBeenCalledWith(previous)
		expect(onUpdate).not.toHaveBeenCalled()
		expect(service.update).toHaveBeenCalledTimes(1)
	})

	it.each(['delete', 'update', 'provider change'])(
		'allows %s when the plugin strategy has been unloaded',
		async (operation) => {
			const onDelete = jest.fn()
			const scopeKey = getTenantGlobalScopeKey('tenant')
			const pluginName = '@test/integration-plugin'
			const provider = 'plugin-provider'
			previous.provider = provider
			registry.register(
				provider,
				{
					meta: { name: provider, label: { en_US: 'Plugin integration' } },
					execute: jest.fn(),
					onDelete
				},
				{ kind: 'plugin', scopeKey, pluginName }
			)
			expect(registry.get(provider)).toMatchObject({ onDelete })
			registry.remove(scopeKey, pluginName)

			const result =
				operation === 'delete'
					? remove.execute(new IntegrationDelCommand(previous.id))
					: upsert.execute(
							new IntegrationUpsertCommand({
								id: previous.id,
								...(operation === 'provider change' ? { provider: 'github' } : { name: 'Renamed' })
							})
						)
			await result
			expect(onDelete).not.toHaveBeenCalled()
			expect(service.delete).toHaveBeenCalledTimes(operation === 'delete' ? 1 : 0)
			expect(service.update).toHaveBeenCalledTimes(operation === 'delete' ? 0 : 1)
		}
	)

	it('cleans up the current integration when switching to a provider without a strategy', async () => {
		const onDelete = jest.fn()
		register({ onDelete })
		await upsert.execute(new IntegrationUpsertCommand({ id: previous.id, provider: 'provider-without-strategy' }))
		expect(onDelete).toHaveBeenCalledWith(previous)
		expect(service.update).toHaveBeenCalledWith(
			previous.id,
			expect.objectContaining({ provider: 'provider-without-strategy' })
		)
	})

	it('matches the registry type instead of the strategy metadata name', async () => {
		const onDelete = jest.fn()
		previous.provider = 'registered-type'
		register(
			{ meta: { name: 'different-metadata-name', label: { en_US: 'Integration' } }, onDelete },
			previous.provider
		)
		await remove.execute(new IntegrationDelCommand(previous.id))
		expect(onDelete).toHaveBeenCalledWith(previous)
		expect(service.delete).toHaveBeenCalledWith(previous.id)
	})

	it('uses the organization hook before the tenant fallback and excludes other tenants', async () => {
		const onOrganizationDelete = jest.fn()
		const onTenantDelete = jest.fn()
		const onOtherTenantDelete = jest.fn()
		const provider = 'scoped-provider'
		previous.provider = provider
		for (const [scopeKey, onDelete] of [
			['organization', onOrganizationDelete],
			[getTenantGlobalScopeKey('tenant'), onTenantDelete],
			[getTenantGlobalScopeKey('another-tenant'), onOtherTenantDelete]
		] as const) {
			registry.register(
				provider,
				{
					meta: { name: provider, label: { en_US: 'Scoped integration' } },
					execute: jest.fn(),
					onDelete
				},
				{ kind: 'plugin', scopeKey, pluginName: '@test/scoped-plugin' }
			)
		}

		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
		await remove.execute(new IntegrationDelCommand(previous.id))
		expect(onOrganizationDelete).toHaveBeenCalledTimes(1)
		expect(onTenantDelete).not.toHaveBeenCalled()
		expect(onOtherTenantDelete).not.toHaveBeenCalled()

		jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('another-organization')
		await remove.execute(new IntegrationDelCommand(previous.id))
		expect(onOrganizationDelete).toHaveBeenCalledTimes(1)
		expect(onTenantDelete).toHaveBeenCalledTimes(1)
		expect(onOtherTenantDelete).not.toHaveBeenCalled()
	})

	it('still requires a strategy for explicit integration testing', async () => {
		await expect(service.test(previous)).rejects.toThrow("No strategy found for type 'github'")
	})
})
