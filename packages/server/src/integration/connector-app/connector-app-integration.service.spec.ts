import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ConnectorAppIntegrationService } from './connector-app-integration.service'
import { Integration } from '../integration.entity'

const scope = { tenantId: 'tenant', organizationId: 'org' }
const descriptor = {
	provider: 'github',
	fields: [
		{ name: 'clientId', label: 'Client ID', required: true },
		{ name: 'clientSecret', label: 'Secret', required: true, secret: true }
	]
}

describe('Connector application integrations', () => {
	const rows = [
		{
			id: 'tenant-app',
			name: 'Tenant app',
			provider: 'github',
			tenantId: 'tenant',
			organizationId: null,
			options: { clientId: 'client', clientSecret: 'secret' }
		},
		{
			id: 'org-app',
			name: 'Org app',
			provider: 'github',
			...scope,
			options: { clientId: 'org-client', clientSecret: 'org-secret' }
		}
	]
	const repository = { find: jest.fn(), findOne: jest.fn(), createQueryBuilder: jest.fn() }
	const commands = { execute: jest.fn() }
	const service = new ConnectorAppIntegrationService(repository, commands)

	beforeEach(() => {
		jest.clearAllMocks()
		jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
		jest.spyOn(RequestContext, 'currentRoleId').mockReturnValue('role')
		commands.execute.mockResolvedValue(true)
		repository.find.mockResolvedValue(rows)
	})
	afterEach(() => jest.restoreAllMocks())

	it('returns inherited choices without exposing application credentials', async () => {
		expect(await service.list(scope, descriptor)).toEqual([
			{ id: 'tenant-app', name: 'Tenant app', organizationId: null },
			{ id: 'org-app', name: 'Org app', organizationId: 'org' }
		])
		expect(repository.find.mock.calls[0][0].where).toHaveLength(2)
	})

	it('does not include organization integrations when listing tenant choices', async () => {
		repository.find.mockResolvedValue([rows[0]])
		await service.list({ tenantId: 'tenant', organizationId: null }, descriptor)
		expect(repository.find.mock.lastCall[0].where).toHaveLength(1)
		expect(repository.find.mock.lastCall[0].where[0].organizationId.type).toBe('isNull')
	})

	it('does not choose another integration when the exact selected ID is unavailable', async () => {
		repository.findOne.mockResolvedValue(null)
		await expect(service.select(scope, descriptor, 'removed')).rejects.toThrow()
	})

	it('requires integration edit permission before creating an application', async () => {
		commands.execute.mockResolvedValue(false)
		await expect(
			service.create(scope, descriptor, 'binding', {
				type: 'new',
				requestId: 'request',
				name: 'App',
				values: { clientId: 'id', clientSecret: 'secret' }
			})
		).rejects.toBeInstanceOf(ForbiddenException)
		expect(repository.createQueryBuilder).not.toHaveBeenCalled()
	})

	it('deduplicates creation across replicas and rejects changed credentials under the same retry key', async () => {
		const storage = new Map<string, Integration>()
		const database = {
			find: jest.fn(async () => [...storage.values()]),
			findOne: jest.fn(async ({ where }: { where: { slug: string } }) => storage.get(where.slug) ?? null),
			createQueryBuilder: jest.fn().mockImplementation(() => {
				let application: Integration
				const builder = {
					insert: () => builder,
					into: () => builder,
					orIgnore: () => builder,
					values: (value: Integration) => {
						application = value
						return builder
					},
					execute: async () => {
						if (!storage.has(application.slug))
							storage.set(application.slug, Object.assign(application, { id: 'created-app' }))
					}
				}
				return builder
			})
		}
		const first = new ConnectorAppIntegrationService(database, commands)
		const second = new ConnectorAppIntegrationService(database, commands)
		const input = {
			type: 'new' as const,
			requestId: 'request',
			name: 'App',
			values: { clientId: 'id', clientSecret: 'secret' }
		}
		const results = await Promise.all([
			first.create(scope, descriptor, 'binding', input),
			second.create(scope, descriptor, 'binding', input)
		])
		expect(results[0]).toEqual(results[1])
		expect(await second.list(scope, descriptor)).toHaveLength(1)
		await expect(
			second.create(scope, descriptor, 'binding', {
				...input,
				values: { clientId: 'changed', clientSecret: 'changed-secret' }
			})
		).rejects.toThrow()
		expect(JSON.stringify(results)).not.toContain('secret')
	})
})
