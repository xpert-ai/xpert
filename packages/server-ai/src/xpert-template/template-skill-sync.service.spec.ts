jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		currentUser: jest.fn(),
		currentRequest: jest.fn()
	},
	runWithRequestContext: (_req: unknown, _res: unknown, callback: () => unknown) => callback()
}))

jest.mock('@xpert-ai/server-core', () => ({
	UserService: class UserService {},
	runWithRequestContext: (_req: unknown, callback: () => unknown) => callback()
}))

import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TemplateSkillSyncService } from './template-skill-sync.service'

describe('TemplateSkillSyncService', () => {
	function createService() {
		const xpertTemplateService = {
			invalidateSkillTemplateCaches: jest.fn().mockResolvedValue(undefined),
			calculateSkillAssetFingerprint: jest.fn().mockResolvedValue('fingerprint-1'),
			readSkillRepositories: jest.fn().mockResolvedValue({
				repositories: [
					{
						name: 'anthropics/skills',
						provider: 'github',
						options: {
							url: 'https://github.com/anthropics/skills'
						}
					}
				]
			}),
			getTemplateSkillBundles: jest.fn().mockResolvedValue([
				{
					directoryPath: '/tmp/template-bundles/claude-api',
					ref: {
						provider: 'github',
						repositoryName: 'anthropics/skills',
						skillId: 'skills/claude-api'
					},
					sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api'
				}
			]),
			getSkillsMarketFeaturedRefs: jest.fn().mockResolvedValue([
				{
					provider: 'github',
					repositoryName: 'anthropics/skills',
					skillId: 'skills/claude-api'
				}
			]),
			getBootstrapDefaultSkillRefs: jest.fn().mockResolvedValue([
				{
					provider: 'github',
					repositoryName: 'anthropics/skills',
					skillId: 'skills/missing'
				}
			]),
			resolveSkillRefs: jest.fn().mockImplementation(async (refs: Array<{ skillId: string }>) =>
				refs
					.filter((ref) => ref.skillId === 'skills/claude-api')
					.map((ref) => ({
						ref,
						skill: {
							id: 'index-public-1',
							repositoryId: 'repo-public'
						}
					}))
			)
		}
		const skillRepositoryService = {
			findAll: jest.fn().mockResolvedValue({ items: [] }),
			register: jest.fn().mockResolvedValue({
				id: 'repo-1',
				name: 'anthropics/skills',
				provider: 'github'
			})
		}
		const skillRepositoryIndexService = {
			sync: jest.fn().mockResolvedValue([{ id: 'index-1' }, { id: 'index-2' }])
		}
		const skillPackageService = {
			ensureWorkspacePublicRepositoryContext: jest.fn().mockResolvedValue({
				workspace: {
					id: 'workspace-1'
				}
			}),
			syncTemplateSkillBundle: jest.fn().mockResolvedValue({
				status: 'updated',
				hash: 'bundle-hash',
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
				index: {
					id: 'index-public-1'
				}
			})
		}
		const userService = {
			getAdminUsers: jest.fn().mockResolvedValue([])
		}
		const skillRepositoryRepository = {
			manager: {
				connection: {
					options: {
						type: 'sqlite'
					}
				}
			},
			createQueryBuilder: jest.fn()
		}
		const workspaceRepository = {
			createQueryBuilder: jest.fn(() => ({
				where: jest.fn().mockReturnThis(),
				andWhere: jest.fn().mockReturnThis(),
				getOne: jest.fn().mockResolvedValue({
					id: 'workspace-1'
				})
			}))
		}
		const cacheManager = {
			get: jest.fn(),
			set: jest.fn().mockResolvedValue(undefined)
		}

		const service = new TemplateSkillSyncService(
			xpertTemplateService as any,
			skillRepositoryService as any,
			skillRepositoryIndexService as any,
			skillPackageService as any,
			userService as any,
			skillRepositoryRepository as any,
			workspaceRepository as any,
			cacheManager as any
		)

		return {
			cacheManager,
			service,
			skillPackageService,
			skillRepositoryIndexService,
			skillRepositoryService
		}
	}

	beforeEach(() => {
		;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
		;(RequestContext.currentUser as jest.Mock).mockReturnValue({
			id: 'user-1',
			tenantId: 'tenant-1',
			preferredLanguage: 'en-US'
		})
	})

	afterEach(() => {
		jest.clearAllMocks()
	})

	it('reports template sync drift in validate-only mode without mutating repositories or indexes', async () => {
		const { cacheManager, service, skillPackageService, skillRepositoryIndexService, skillRepositoryService } =
			createService()

		const result = await service.syncCurrentTenantSkillAssets({
			mode: 'full',
			validateOnly: true,
			skipLock: true
		})

		expect(skillRepositoryService.register).not.toHaveBeenCalled()
		expect(skillRepositoryIndexService.sync).not.toHaveBeenCalled()
		expect(skillPackageService.syncTemplateSkillBundle).toHaveBeenCalledWith(
			'workspace-1',
			{
				bundleRootPath: '/tmp/template-bundles/claude-api',
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api'
			},
			{
				skipAccessCheck: true,
				validateOnly: true
			}
		)
		expect(cacheManager.set).not.toHaveBeenCalled()
		expect(result.validateOnly).toBe(true)
		expect(result.summary.workspaceDefaults.missing).toBe(1)
		expect(result.summary.bundles.updated).toBe(1)
	})

	it('persists the fingerprint after a write sync and returns aggregated summaries', async () => {
		const { cacheManager, service, skillPackageService, skillRepositoryIndexService, skillRepositoryService } =
			createService()
		skillRepositoryService.findAll.mockResolvedValue({
			items: [
				{
					id: 'repo-1',
					name: 'anthropics/skills',
					provider: 'github',
					options: {
						url: 'https://old.example.com'
					},
					credentials: null
				}
			]
		})

		const result = await service.syncCurrentTenantSkillAssets({
			mode: 'incremental',
			validateOnly: false,
			skipLock: true
		})

		expect(skillRepositoryService.register).toHaveBeenCalledWith({
			id: 'repo-1',
			name: 'anthropics/skills',
			provider: 'github',
			options: {
				url: 'https://github.com/anthropics/skills'
			},
			credentials: null
		})
		expect(skillRepositoryIndexService.sync).toHaveBeenCalledWith('repo-1', { mode: 'incremental' })
		expect(skillPackageService.ensureWorkspacePublicRepositoryContext).toHaveBeenCalledTimes(1)
		expect(cacheManager.set).toHaveBeenCalledWith('xpert:template-skill-sync:fingerprint:tenant-1', 'fingerprint-1')
		expect(result.summary.repositories.updated).toBe(1)
		expect(result.summary.indexes.updated).toBe(1)
		expect(result.summary.featuredRefs.unchanged).toBe(1)
	})
})
