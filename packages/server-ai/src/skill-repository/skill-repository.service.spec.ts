jest.mock('@xpert-ai/server-common', () => ({
	getErrorMessage: (error: Error) => error?.message ?? String(error)
}))

jest.mock('@xpert-ai/server-core', () => ({
	TenantOrganizationAwareCrudService: class TenantOrganizationAwareCrudService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async findAll(filter?: any) {
			return this.repository.findAll(filter)
		}

		async findAllInOrganizationOrTenant(filter?: any) {
			return this.repository.findAllInOrganizationOrTenant
				? this.repository.findAllInOrganizationOrTenant(filter)
				: this.repository.findAll(filter)
		}

		async findOneByIdString(id: string, options?: any) {
			return this.repository.findOneByIdString(id, options)
		}

		async findOneInOrganizationOrTenant(id: string, options?: any) {
			return this.repository.findOneInOrganizationOrTenant
				? this.repository.findOneInOrganizationOrTenant(id, options)
				: this.repository.findOneByIdString(id, options)
		}

		async create(entity: T) {
			return this.repository.create(entity)
		}

		async update(id: string, entity: Partial<T>) {
			return this.repository.update(id, entity)
		}

		async delete(id: string) {
			return this.repository.delete(id)
		}
	},
	TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {}
}))

jest.mock('@nestjs/typeorm', () => ({
	InjectRepository: () => () => undefined
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		getOrganizationId: jest.fn()
	},
	SkillSourceProviderStrategy: () => () => undefined,
	SkillSourceProviderRegistry: class SkillSourceProviderRegistry {}
}))

jest.mock('../shared/translate', () => ({
	translate: jest.fn((value?: string | { zh_Hans?: string; en_US?: string } | null) => {
		if (!value) {
			return ''
		}

		return typeof value === 'string' ? value : value.zh_Hans ?? value.en_US ?? ''
	})
}))

import { SkillRepositoryService } from './skill-repository.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'

describe('SkillRepositoryService', () => {
	let repository: {
		create: jest.Mock
		delete: jest.Mock
		findAll: jest.Mock
		findAllInOrganizationOrTenant: jest.Mock
		findOne: jest.Mock
		findOneByIdString: jest.Mock
		update: jest.Mock
	}
	let service: SkillRepositoryService

	beforeEach(() => {
		repository = {
			create: jest.fn(async (entity) => ({ id: 'repo-public', ...entity })),
			delete: jest.fn(),
			findAll: jest.fn(),
			findAllInOrganizationOrTenant: jest.fn(),
			findOne: jest.fn(),
			findOneByIdString: jest.fn(),
			update: jest.fn()
		}

		service = new SkillRepositoryService(repository as any)
		;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
		;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
		;(service as any).skillSourceProviderRegistry = {
			list: jest.fn().mockReturnValue([
				{
					type: 'workspace-public',
					meta: {
						name: 'workspace-public',
						label: {
							en_US: 'Workspace Shared Skills',
							zh_Hans: '工作区共享技能'
						}
					}
				},
				{
					type: 'file',
					meta: {
						name: 'file',
						label: {
							en_US: 'Zip Upload',
							zh_Hans: 'Zip Upload'
						}
					}
				},
				{
					type: 'github',
					meta: {
						name: 'github',
						label: {
							en_US: 'GitHub',
							zh_Hans: 'GitHub'
						}
					}
				}
			])
		}
	})

	it('localizes the workspace public repository name in list results', async () => {
		repository.findOne.mockResolvedValue({
			id: 'repo-public',
			name: 'Workspace Shared Skills',
			provider: 'workspace-public',
			tenantId: 'tenant-1',
			organizationId: null
		})
		repository.findAll.mockResolvedValue({
			items: [
				{
					id: 'repo-public',
					name: 'Workspace Shared Skills',
					provider: 'workspace-public'
				},
				{
					id: 'repo-custom',
					name: 'anthropics/skills',
					provider: 'github'
				}
			],
			total: 2
		})

		const result = await service.findAll()

		expect(result).toEqual({
			items: [
				expect.objectContaining({
					id: 'repo-public',
					name: '工作区共享技能',
					provider: 'workspace-public'
				}),
				expect.objectContaining({
					id: 'repo-custom',
					name: 'anthropics/skills',
					provider: 'github'
				})
			],
			total: 2
		})
	})

	it('creates the workspace public repository with the localized default name', async () => {
		repository.findOne.mockResolvedValue(null)

		const result = await service.ensureWorkspacePublicRepository()

		expect(repository.findOne).toHaveBeenCalledWith({
			where: expect.objectContaining({
				provider: 'workspace-public',
				tenantId: 'tenant-1'
			})
		})
		expect(repository.create).toHaveBeenCalledWith({
			name: '工作区共享技能',
			provider: 'workspace-public'
		})
		expect(result).toEqual(
			expect.objectContaining({
				id: 'repo-public',
				name: '工作区共享技能',
				provider: 'workspace-public'
			})
		)
	})

	it('ensures the workspace public repository exists before organization-scoped list calls', async () => {
		;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
		repository.findOne.mockResolvedValue(null)
		repository.findAll.mockResolvedValue({
			items: [],
			total: 0
		})

		await service.findAll()

		expect(repository.create).toHaveBeenCalledWith({
			name: '工作区共享技能',
			provider: 'workspace-public'
		})
	})

	it('ensures the workspace public repository exists before tenant-scoped list calls', async () => {
		repository.findOne.mockResolvedValue(null)
		repository.findAll.mockResolvedValue({
			items: [],
			total: 0
		})

		await service.findAll()

		expect(repository.create).toHaveBeenCalledWith({
			name: '工作区共享技能',
			provider: 'workspace-public'
		})
	})

	it('omits system managed repository providers from the manual registration list', () => {
		expect(service.getSourceStrategies().map((strategy) => strategy.name)).toEqual(['github'])
	})
})
