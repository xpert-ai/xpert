import { OrganizationController } from './organization.controller'

describe('OrganizationController', () => {
	it('passes paging, ordering, and search filters to the organization query', async () => {
		const organizationService = {
			findAll: jest.fn().mockResolvedValue({ items: [], total: 0 })
		}
		const controller = new OrganizationController(
			organizationService as unknown as ConstructorParameters<typeof OrganizationController>[0],
			{ execute: jest.fn() } as unknown as ConstructorParameters<typeof OrganizationController>[1]
		)
		const findInput = {
			isActive: true,
			name: { $ilike: '%searched%' }
		}
		const relations = ['featureOrganizations', 'featureOrganizations.feature']
		const order = { name: 'ASC' as const }

		await controller.findAll({
			findInput,
			relations,
			take: 10,
			skip: 10,
			order
		})

		expect(organizationService.findAll).toHaveBeenCalledWith({
			where: findInput,
			relations,
			take: 10,
			skip: 10,
			order,
			select: undefined
		})
	})
})
