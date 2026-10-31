import { RequestContext } from '@xpert-ai/plugin-sdk'
import { RequestScopeLevel } from '@xpert-ai/contracts'
import { FindOneOptions } from 'typeorm'
import { Integration } from '../integration.entity'
import { IntegrationService } from '../integration.service'

describe('integration consumption with projected metadata', () => {
	const scope = { tenantId: 'tenant', organizationId: 'org', level: RequestScopeLevel.ORGANIZATION }
	const own = Object.assign(new Integration(), { id: 'own', name: 'Own', provider: 'parser', ...scope })
	const shared = Object.assign(new Integration(), {
		id: 'shared',
		name: 'Shared',
		provider: 'parser',
		tenantId: 'tenant',
		organizationId: null,
		sharing: { visibility: 'all-organizations', organizationIds: [], usages: ['invoke'] }
	})
	const privateRow = Object.assign(new Integration(), { ...shared, id: 'private', sharing: null })
	const repository = { findOne: jest.fn() }
	let service: IntegrationService

	beforeEach(() => {
		jest.spyOn(RequestContext, 'getScope').mockReturnValue(scope)
		service = new IntegrationService(repository as never, {} as never, {} as never, {} as never)
	})
	afterEach(() => jest.restoreAllMocks())

	it.each<FindOneOptions<Integration>['select']>([
		{ id: true, name: true, provider: true },
		['id', 'name', 'provider']
	])('authorizes parser choices before applying the output projection: %j', async (select) => {
		const inheritance = jest.spyOn(service, 'findWithInheritance').mockImplementation(async (options) => {
			const querySelect = options.select
			for (const field of ['tenantId', 'organizationId', 'sharing'] as const) {
				expect(Array.isArray(querySelect) ? querySelect.includes(field) : querySelect[field]).toBeTruthy()
			}
			return { items: [own, shared, privateRow], total: 3 }
		})
		const result = await service.findAllInOrganizationOrTenant({ where: { provider: 'parser' }, select })
		expect(result.total).toBe(2)
		expect(result.items.map(({ id }) => id)).toEqual(['own', 'shared'])
		for (const item of result.items) {
			expect(item).not.toHaveProperty('tenantId')
			expect(item).not.toHaveProperty('organizationId')
			expect(item).not.toHaveProperty('sharing')
		}
		expect(inheritance).toHaveBeenCalledTimes(1)
		expect(shared).toHaveProperty('sharing')
	})
	it('loads policy fields for exact reads and preserves explicitly requested scope fields', async () => {
		repository.findOne.mockResolvedValue(shared)
		const result = await service.readForUsage(shared.id, 'invoke', scope, { select: { id: true, tenantId: true } })
		expect(repository.findOne).toHaveBeenCalledWith({
			where: { id: shared.id, tenantId: scope.tenantId },
			select: { id: true, tenantId: true, organizationId: true, sharing: true }
		})
		expect(result).toMatchObject({ id: shared.id, tenantId: scope.tenantId })
		expect(result).not.toHaveProperty('sharing')
		expect(result).not.toHaveProperty('organizationId')
		repository.findOne.mockResolvedValue(privateRow)
		await expect(service.readForUsage(privateRow.id, 'invoke', scope, { select: ['id'] })).resolves.toBeNull()
	})
})
