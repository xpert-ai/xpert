jest.mock('../core/context', () => ({
	RequestContext: {
		currentTenantId: jest.fn(() => 'tenant-1')
	}
}))

jest.mock('i18next', () => ({
	t: jest.fn((key: string) => `translated:${key}`)
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

jest.mock('./default-features', () => ({
	DEFAULT_FEATURES: [
		{
			code: 'FEATURE_COPILOT',
			isEnabled: true,
			children: [
				{
					code: 'FEATURE_MEMBERSHIP_PLAN',
					isEnabled: false
				}
			]
		},
		{
			code: 'GROUP_XPERT',
			isEnabled: false,
			children: [
				{
					code: 'FEATURE_XPERT',
					isEnabled: true
				}
			]
		}
	]
}))

jest.mock('./../core/crud', () => ({
	TenantAwareCrudService: class TenantAwareCrudService<T> {
		protected repository: unknown

		constructor(repository: unknown) {
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
	const cacheManager = {
		set: jest.fn()
	}
	const featureService = {
		findOne: jest.fn().mockResolvedValue({
			id: 'feature-1',
			code: 'FEATURE_MEMBERSHIP_PLAN'
		})
	}
	const eventEmitter = {
		emit: jest.fn()
	}

	let service: InstanceType<typeof FeatureOrganizationService>

	beforeEach(() => {
		jest.clearAllMocks()
		RequestContext.currentTenantId.mockReturnValue('tenant-1')
		service = new FeatureOrganizationService(repo, featureService, cacheManager, eventEmitter)
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
		expect(cacheManager.set).toHaveBeenCalledWith(
			expect.stringContaining('user:me:feature-context:tenant-version:tenant-1'),
			expect.any(String),
			86400000
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

	it('rejects organization-scoped membership purchase feature updates', async () => {
		featureService.findOne.mockResolvedValueOnce({
			id: 'feature-purchase',
			code: 'FEATURE_MEMBERSHIP_PURCHASE'
		})

		await expect(
			service.updateFeatureOrganization({
				featureId: 'feature-purchase',
				organizationId: 'org-1',
				isEnabled: true
			})
		).rejects.toThrow('translated:server-ai:Error.MembershipPurchaseFeatureTenantScopeRequired')

		expect(repo.save).not.toHaveBeenCalled()
	})

	it('allows organization-scoped membership plan feature updates', async () => {
		featureService.findOne.mockResolvedValueOnce({
			id: 'feature-plan',
			code: 'FEATURE_MEMBERSHIP_PLAN'
		})
		jest.spyOn(service, 'findAll').mockResolvedValue({ items: [], total: 0 })
		repo.save.mockResolvedValue([])

		await service.updateFeatureOrganization({
			featureId: 'feature-plan',
			organizationId: 'org-1',
			isEnabled: true
		})

		expect(repo.save).toHaveBeenCalledWith(
			expect.objectContaining({
				featureId: 'feature-plan',
				organizationId: 'org-1',
				isEnabled: true
			})
		)
	})

	it('emits one transition event when a tenant feature becomes enabled', async () => {
		jest.spyOn(service, 'findAll')
			.mockResolvedValueOnce({
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
			.mockResolvedValueOnce({
				items: [
					{
						id: 'fo-1',
						featureId: 'feature-1',
						tenantId: 'tenant-1',
						organizationId: null,
						isEnabled: true
					}
				],
				total: 1
			})
		repo.save.mockResolvedValue([])

		await service.updateFeatureOrganization({
			featureId: 'feature-1',
			isEnabled: true
		})
		await service.updateFeatureOrganization({
			featureId: 'feature-1',
			isEnabled: true
		})

		expect(eventEmitter.emit).toHaveBeenCalledTimes(1)
		expect(eventEmitter.emit).toHaveBeenCalledWith(
			'feature.organization.updated',
			expect.objectContaining({
				tenantId: 'tenant-1',
				organizationId: null,
				featureId: 'feature-1',
				featureCode: 'FEATURE_MEMBERSHIP_PLAN',
				previousIsEnabled: false,
				isEnabled: true
			})
		)
	})

	it('does not create tenant toggles for feature groups', async () => {
		const tenant = { id: 'tenant-1' }
		const featureService = {
			findAll: jest.fn().mockResolvedValue({
				items: [
					{
						id: 'feature-group',
						code: 'GROUP_XPERT',
						isEnabled: false,
						children: [{ id: 'feature-xpert' }]
					},
					{
						id: 'feature-xpert',
						code: 'FEATURE_XPERT',
						isEnabled: true,
						children: []
					}
				]
			})
		}
		service = new FeatureOrganizationService(repo, featureService, cacheManager, eventEmitter)
		repo.save.mockResolvedValue([])

		await service.updateTenantFeatureOrganizations([tenant])

		expect(featureService.findAll).toHaveBeenCalledWith({
			relations: ['children']
		})
		expect(repo.save).toHaveBeenCalledWith([
			expect.objectContaining({
				isEnabled: true,
				feature: expect.objectContaining({
					id: 'feature-xpert'
				}),
				tenant
			})
		])
		expect(repo.save).not.toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					feature: expect.objectContaining({
						id: 'feature-group'
					})
				})
			])
		)
	})

	it('initializes new tenant toggles from default feature definitions', async () => {
		const tenant = { id: 'tenant-1' }
		const featureService = {
			findAll: jest.fn().mockResolvedValue({
				items: [
					{
						id: 'feature-membership-plan',
						code: 'FEATURE_MEMBERSHIP_PLAN',
						isEnabled: true,
						children: []
					},
					{
						id: 'feature-xpert',
						code: 'FEATURE_XPERT',
						isEnabled: false,
						children: []
					}
				]
			})
		}
		service = new FeatureOrganizationService(repo, featureService, cacheManager, eventEmitter)
		repo.save.mockResolvedValue([])

		await service.updateTenantFeatureOrganizations([tenant])

		expect(repo.save).toHaveBeenCalledWith(
			expect.arrayContaining([
				expect.objectContaining({
					isEnabled: false,
					feature: expect.objectContaining({
						code: 'FEATURE_MEMBERSHIP_PLAN',
						isEnabled: true
					})
				}),
				expect.objectContaining({
					isEnabled: true,
					feature: expect.objectContaining({
						code: 'FEATURE_XPERT',
						isEnabled: false
					})
				})
			])
		)
	})
})
