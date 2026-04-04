jest.mock('../core/context', () => ({
	RequestContext: {
		currentTenantId: jest.fn(() => 'tenant-1')
	}
}))

jest.mock('./feature-organization.entity', () => ({
	FeatureOrganization: class FeatureOrganization {
		constructor(input?: Record<string, unknown>) {
			Object.assign(this, input)
		}

		instanceOf(input: Record<string, unknown>) {
			return Object.assign(new FeatureOrganization(), input)
		}
	}
}))

jest.mock('./feature.service', () => ({
	FeatureService: class FeatureService {}
}))

jest.mock('./../core/crud', () => ({
	TenantAwareCrudService: class TenantAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async findAll(): Promise<{ items: T[]; total: number }> {
			return { items: [], total: 0 }
		}
	}
}))

const { IsNull } = require('typeorm')
const { RequestContext } = require('../core/context')
const { FeatureOrganizationService } = require('./feature-organization.service')

describe('FeatureOrganizationService', () => {
	const repo = {
		save: jest.fn()
	}

	let service: InstanceType<typeof FeatureOrganizationService>

	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		service = new FeatureOrganizationService(repo as any, {} as any)
	})

	it('queries tenant-scoped toggles with organizationId IsNull when no organizationId is provided', async () => {
		const findAllSpy = jest.spyOn(service, 'findAll').mockResolvedValue({
			items: [],
			total: 0
		})
		repo.save.mockResolvedValue({
			featureId: 'feature-1',
			tenantId: 'tenant-1',
			isEnabled: true
		})

		await service.updateFeatureOrganization({
			featureId: 'feature-1',
			isEnabled: true
		})

		expect(findAllSpy).toHaveBeenCalledWith({
			where: {
				tenantId: 'tenant-1',
				featureId: 'feature-1',
				organizationId: IsNull()
			}
		})
		expect(repo.save).toHaveBeenCalledWith(
			expect.objectContaining({
				featureId: 'feature-1',
				tenantId: 'tenant-1',
				isEnabled: true
			})
		)
	})

	it('updates existing tenant-scoped feature toggles without touching organization scope', async () => {
		jest.spyOn(service, 'findAll').mockResolvedValue({
			items: [
				{
					id: 'fo-1',
					featureId: 'feature-1',
					tenantId: 'tenant-1',
					organizationId: null,
					isEnabled: false
				}
			],
			total: 1
		})
		repo.save.mockResolvedValue([])

		await service.updateFeatureOrganization({
			featureId: 'feature-1',
			isEnabled: true
		})

		expect(repo.save).toHaveBeenCalledWith([
			expect.objectContaining({
				id: 'fo-1',
				featureId: 'feature-1',
				tenantId: 'tenant-1',
				organizationId: null,
				isEnabled: true
			})
		])
	})
})
