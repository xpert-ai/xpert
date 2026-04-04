jest.mock('@metad/server-common', () => ({
	getErrorMessage: (error: Error) => error?.message ?? String(error)
}))

jest.mock('@nestjs/typeorm', () => ({
	InjectRepository: () => () => undefined
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		getOrganizationId: jest.fn(),
		currentUserId: jest.fn()
	},
	SkillSourceProviderRegistry: class SkillSourceProviderRegistry {}
}))

jest.mock('../skill-repository', () => ({
	getWorkspaceSkillsRoot: jest.fn().mockReturnValue('/tmp/workspace-skills'),
	SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('../xpert-workspace', () => ({
	XpertWorkspaceBaseService: class XpertWorkspaceBaseService<T> {
		protected repository: any

		constructor(repository: any) {
			this.repository = repository
		}

		async create(entity: T) {
			return entity
		}
	}
}))

jest.mock('../xpert-workspace/workspace.entity', () => ({
	XpertWorkspace: class XpertWorkspace {}
}))

import { getWorkspaceSkillsRoot } from '../skill-repository'
import { SkillPackageService } from './skill-package.service'

describe('SkillPackageService', () => {
	let service: SkillPackageService
	let skillIndexService: {
		findOneInOrganizationOrTenant: jest.Mock
	}
	let strategy: {
		installSkillPackage: jest.Mock
	}
	let createSpy: jest.SpiedFunction<SkillPackageService['create']>

	beforeEach(() => {
		skillIndexService = {
			findOneInOrganizationOrTenant: jest.fn()
		}
		strategy = {
			installSkillPackage: jest.fn().mockResolvedValue('clawhub/weather')
		}

		service = new SkillPackageService({} as any, skillIndexService as any, {} as any)
		;(service as any).skillSourceProviderRegistry = {
			get: jest.fn().mockReturnValue(strategy)
		}

		jest.spyOn(service as any, 'assertWorkspaceAccess').mockResolvedValue(undefined)
		createSpy = jest.spyOn(service, 'create').mockImplementation(async (item: any) => item)
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it('persists the selected index version into skill package metadata during install', async () => {
		skillIndexService.findOneInOrganizationOrTenant.mockResolvedValue({
			id: 'index-1',
			name: 'Weather',
			skillPath: 'weather',
			description: 'Forecasts',
			tags: ['marketplace', 'clawhub'],
			version: '1.2.3',
			repository: {
				provider: 'clawhub',
				tenantId: 'tenant-1'
			}
		})

		const result = await service.installSkillPackage('workspace-1', 'index-1')

		expect(getWorkspaceSkillsRoot).toHaveBeenCalledWith('tenant-1', 'workspace-1')
		expect(strategy.installSkillPackage).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'index-1',
				version: '1.2.3'
			}),
			'/tmp/workspace-skills'
		)
		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: 'workspace-1',
				name: 'Weather',
				skillIndexId: 'index-1',
				packagePath: 'clawhub/weather',
				metadata: expect.objectContaining({
					version: '1.2.3',
					tags: ['marketplace', 'clawhub']
				})
			})
		)
		expect(result).toMatchObject({
			metadata: expect.objectContaining({
				version: '1.2.3'
			})
		})
	})

	it('keeps installs working when the repository index has no version', async () => {
		skillIndexService.findOneInOrganizationOrTenant.mockResolvedValue({
			id: 'index-2',
			name: 'Calendar',
			skillPath: 'calendar',
			description: 'Calendar helper',
			tags: ['marketplace'],
			repository: {
				provider: 'clawhub',
				tenantId: 'tenant-1'
			}
		})

		const result = await service.installSkillPackage('workspace-1', 'index-2')
		const createArg = createSpy.mock.calls[0][0] as any

		expect(strategy.installSkillPackage).toHaveBeenCalledWith(
			expect.objectContaining({
				id: 'index-2',
				version: undefined
			}),
			'/tmp/workspace-skills'
		)
		expect(createArg.metadata.version).toBeUndefined()
		expect(result.metadata.version).toBeUndefined()
	})
})
