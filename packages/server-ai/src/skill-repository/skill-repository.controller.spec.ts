jest.mock('@xpert-ai/server-core', () => ({
	CrudController: class CrudController {
		constructor() {}
	},
	TenantOrganizationBaseEntity: class TenantOrganizationBaseEntity {},
	TransformInterceptor: class TransformInterceptor {}
}))

jest.mock('../skill-package/skill-package.service', () => ({
	SkillPackageService: class SkillPackageService {}
}))

jest.mock('./skill-repository.service', () => ({
	SkillRepositoryService: class SkillRepositoryService {}
}))

import { SkillRepositoryController } from './skill-repository.controller'

describe('SkillRepositoryController', () => {
	it('returns repository select options for middleware configuration', async () => {
		const service = {
			findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({
				items: [
					{
						id: 'repo-1',
						name: 'Workspace Shared Skills',
						provider: 'workspace-public'
					},
					{
						id: 'repo-2',
						name: 'GitHub Skills',
						provider: 'github'
					}
				],
				total: 2
			})
		}
		const skillPackageService = {
			initializeWorkspacePublicRepository: jest.fn(),
			uploadWorkspacePublicRepositoryPackages: jest.fn()
		}
		const controller = new SkillRepositoryController(service as never, skillPackageService as never)

		const result = await controller.getSelectOptions()

		expect(service.findAllInOrganizationOrTenant).toHaveBeenCalledWith({
			order: {
				updatedAt: 'DESC'
			}
		})
		expect(result).toEqual([
			{
				value: 'repo-1',
				label: 'Workspace Shared Skills',
				description: 'workspace-public'
			},
			{
				value: 'repo-2',
				label: 'GitHub Skills',
				description: 'github'
			}
		])
	})
})
