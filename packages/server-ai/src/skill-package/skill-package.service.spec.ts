jest.mock('@xpert-ai/server-common', () => ({
	getErrorMessage: (error: Error) => error?.message ?? String(error),
	urlJoin: (...parts: string[]) =>
		parts
			.filter((part) => part.length > 0)
			.map((part, index) => (index === 0 ? part.replace(/\/+$/g, '') : part.replace(/^\/+|\/+$/g, '')))
			.join('/'),
	yaml: {
		parse: (value: string) => {
			const lines = value.split('\n')
			const result: {
				name?: string
				description?: string
				version?: string
				license?: string
				tags?: string[]
			} = {}
			let currentArrayKey: 'tags' | null = null

			for (const rawLine of lines) {
				const line = rawLine.trimEnd()
				const trimmed = line.trim()
				if (!trimmed) {
					continue
				}
				if (currentArrayKey && trimmed.startsWith('- ')) {
					result.tags = [...(result.tags ?? []), trimmed.slice(2).trim()]
					continue
				}
				currentArrayKey = null

				const colonIndex = line.indexOf(':')
				if (colonIndex === -1) {
					continue
				}

				const key = line.slice(0, colonIndex).trim()
				const parsedValue = line.slice(colonIndex + 1).trim()
				if (key === 'tags' && !parsedValue) {
					currentArrayKey = 'tags'
					result.tags = []
					continue
				}

				if (key === 'name' || key === 'description' || key === 'version' || key === 'license') {
					result[key] = parsedValue
				}
			}

			return result
		}
	}
}))

jest.mock('@nestjs/typeorm', () => ({
	InjectRepository: () => () => undefined,
	TypeOrmModule: {
		forFeature: () => ({}),
		forFeatureAsync: () => ({}),
		forRoot: () => ({}),
		forRootAsync: () => ({})
	}
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
	RequestContext: {
		currentTenantId: jest.fn(),
		getOrganizationId: jest.fn(),
		currentUserId: jest.fn(),
		currentUser: jest.fn()
	},
	SkillSourceProviderStrategy: () => () => undefined,
	SkillSourceProviderRegistry: class SkillSourceProviderRegistry {}
}))

jest.mock('../skill-repository/types', () => ({
	getWorkspaceSkillsRoot: jest.fn().mockReturnValue('/tmp/workspace-skills'),
	getOrganizationSharedSkillsRoot: jest.fn().mockReturnValue('/tmp/shared-skills'),
	getOrganizationSharedSkillPath: jest.fn((_tenantId: string, _organizationId: string, sharedSkillId: string) => `/tmp/shared-skills/${sharedSkillId}`),
	isWorkspacePublicSkillRepositoryProvider: jest.fn((provider: string) => provider === 'workspace-public')
}))

jest.mock('../skill-repository/repository-index/skill-repository-index.service', () => ({
	SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('../skill-repository/skill-repository.service', () => ({
	SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('../xpert-template/xpert-template.service', () => ({
	XpertTemplateService: class XpertTemplateService {}
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

		async findOne() {
			return null
		}

		async update() {
			return null
		}
	}
}))

jest.mock('../xpert-workspace/workspace.entity', () => ({
	XpertWorkspace: class XpertWorkspace {}
}))

jest.mock('./skill-package.entity', () => ({
	SkillPackage: class SkillPackage {}
}))

jest.mock('../skill-repository/plugins/zip', () => ({
	FILE_SKILL_SOURCE_PROVIDER: 'file',
	cleanupExtractedSkillArchive: jest.fn().mockResolvedValue(undefined),
	extractSkillsFromZip: jest.fn(),
	installUploadedSkills: jest.fn(),
	normalizeUploadedSkillPath: jest.fn((value: string) => value.trim().replace(/^\/+/, ''))
}))

import { getOrganizationSharedSkillPath, getWorkspaceSkillsRoot } from '../skill-repository/types'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { SkillPackageService } from './skill-package.service'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import {
	cleanupExtractedSkillArchive,
	extractSkillsFromZip,
	installUploadedSkills
} from '../skill-repository/plugins/zip'

describe('SkillPackageService', () => {
	let service: SkillPackageService
	let repository: {
		findOne: jest.Mock
		softDelete: jest.Mock
	}
	let skillIndexService: {
		findOneInOrganizationOrTenant: jest.Mock
		findAll: jest.Mock
		create: jest.Mock
		softDelete: jest.Mock
	}
	let skillRepositoryService: {
		ensureWorkspacePublicRepository: jest.Mock
		findAll: jest.Mock
		findOneInOrganizationOrTenant: jest.Mock
	}
	let xpertTemplateService: {
		getTemplateSkillBundles: jest.Mock
	}
	let workspaceRepository: {
		create: jest.Mock
		createQueryBuilder: jest.Mock
		findOne: jest.Mock
		save: jest.Mock
		update: jest.Mock
	}
	let strategy: {
		installSkillPackage: jest.Mock
		uninstallSkillPackage: jest.Mock
	}
	let createSpy: jest.SpiedFunction<SkillPackageService['create']>
	let tempRoot: string | null

	beforeEach(() => {
		;(RequestContext.currentTenantId as jest.Mock).mockReturnValue('tenant-1')
		;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue('org-1')
		;(RequestContext.currentUserId as jest.Mock).mockReturnValue('user-1')
		;(RequestContext.currentUser as jest.Mock).mockReturnValue({
			id: 'user-1',
			firstName: 'Workspace',
			lastName: 'Owner'
		})

		skillIndexService = {
			findOneInOrganizationOrTenant: jest.fn(),
			findAll: jest.fn().mockResolvedValue({ items: [] }),
			create: jest.fn().mockImplementation(async (item: any) => item),
			softDelete: jest.fn().mockResolvedValue({ affected: 1 })
		}
		skillRepositoryService = {
			ensureWorkspacePublicRepository: jest.fn().mockResolvedValue({
				id: 'repo-public',
				provider: 'workspace-public'
			}),
			findAll: jest.fn().mockResolvedValue({ items: [] }),
			findOneInOrganizationOrTenant: jest.fn()
		}
		xpertTemplateService = {
			getTemplateSkillBundles: jest.fn().mockResolvedValue([])
		}
		strategy = {
			installSkillPackage: jest.fn().mockResolvedValue('clawhub/weather'),
			uninstallSkillPackage: jest.fn().mockResolvedValue(undefined)
		}

		repository = {
			findOne: jest.fn().mockResolvedValue(null),
			softDelete: jest.fn().mockResolvedValue({ affected: 1 })
		}

		workspaceRepository = {
			create: jest.fn((entity) => entity),
			createQueryBuilder: jest.fn(() => ({
				where: jest.fn().mockReturnThis(),
				andWhere: jest.fn().mockReturnThis(),
				getOne: jest.fn().mockResolvedValue(null)
			})),
			findOne: jest.fn().mockResolvedValue(null),
			save: jest.fn(async (entity) => ({
				id: 'workspace-org-default',
				...entity
			})),
			update: jest.fn().mockResolvedValue({ affected: 1 })
		}

		service = new SkillPackageService(
			repository as any,
			skillRepositoryService as any,
			skillIndexService as any,
			workspaceRepository as any,
			xpertTemplateService as any
		)
		;(service as any).skillSourceProviderRegistry = {
			get: jest.fn().mockReturnValue(strategy)
		}
		tempRoot = null

		jest.spyOn(service as any, 'assertWorkspaceAccess').mockResolvedValue(undefined)
		createSpy = jest.spyOn(service, 'create').mockImplementation(async (item: any) => item)
		jest.spyOn(service, 'update').mockResolvedValue({ affected: 1 } as any)
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue('/tmp/workspace-skills')
	})

	afterEach(async () => {
		if (tempRoot) {
			await rm(tempRoot, { recursive: true, force: true })
			tempRoot = null
		}
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
				id: 'index-2'
			}),
			'/tmp/workspace-skills'
		)
		expect(createArg.metadata.version).toBeUndefined()
		expect(result.metadata.version).toBeUndefined()
	})

	it('reuses an existing installed skill package for the same workspace and index', async () => {
		repository.findOne.mockResolvedValue({
			id: 'skill-existing-1',
			workspaceId: 'workspace-1',
			skillIndexId: 'index-1'
		})
		const installSpy = jest.spyOn(service, 'installSkillPackage')

		const result = await service.ensureInstalledSkillPackage('workspace-1', 'index-1')

		expect(repository.findOne).toHaveBeenCalledWith({
			where: {
				workspaceId: 'workspace-1',
				skillIndexId: 'index-1'
			},
			relations: ['skillIndex', 'skillIndex.repository']
		})
		expect(installSpy).not.toHaveBeenCalled()
		expect(result).toEqual({
			id: 'skill-existing-1',
			workspaceId: 'workspace-1',
			skillIndexId: 'index-1'
		})
	})

	it('installs the skill package when no workspace copy exists yet', async () => {
		repository.findOne.mockResolvedValue(null)
		const installSpy = jest.spyOn(service, 'installSkillPackage').mockResolvedValue({
			id: 'skill-installed-1'
		} as any)

		const result = await service.ensureInstalledSkillPackage('workspace-1', 'index-1')

		expect(installSpy).toHaveBeenCalledWith('workspace-1', 'index-1')
		expect(result).toEqual({
			id: 'skill-installed-1'
		})
	})

	it('installs every package from a repository into the workspace', async () => {
		skillRepositoryService.findOneInOrganizationOrTenant.mockResolvedValue({
			id: 'repo-public',
			provider: 'workspace-public'
		})
		skillIndexService.findAll.mockResolvedValue({
			items: [{ id: 'index-1' }, { id: 'index-2' }]
		})
		const ensureInstalledSkillPackage = jest
			.spyOn(service, 'ensureInstalledSkillPackage')
			.mockResolvedValueOnce({ id: 'package-1' } as any)
			.mockResolvedValueOnce({ id: 'package-2' } as any)

		const result = await service.installRepositorySkillPackages('workspace-1', 'repo-public')

		expect(skillRepositoryService.findOneInOrganizationOrTenant).toHaveBeenCalledWith('repo-public')
		expect(skillIndexService.findAll).toHaveBeenCalledWith(
			expect.objectContaining({
				where: {
					repositoryId: 'repo-public'
				}
			})
		)
		expect(ensureInstalledSkillPackage).toHaveBeenNthCalledWith(1, 'workspace-1', 'index-1')
		expect(ensureInstalledSkillPackage).toHaveBeenNthCalledWith(2, 'workspace-1', 'index-2')
		expect(result).toEqual([{ id: 'package-1' }, { id: 'package-2' }])
	})

	it('uploads zip packages only to the workspace public repository and publishes them from the org default workspace', async () => {
		skillRepositoryService.findOneInOrganizationOrTenant.mockResolvedValue({
			id: 'repo-public',
			provider: 'workspace-public'
		})
		;(extractSkillsFromZip as jest.Mock).mockResolvedValue({
			tempDir: '/tmp/skill-archive',
			skills: [
				{
					name: 'Weather Skill',
					description: 'Shareable weather skill',
					absolutePath: '/tmp/uploaded/weather',
					skillPath: 'weather'
				}
			]
		})
		const publishUploadedWorkspacePublicSkill = jest
			.spyOn(service as any, 'publishUploadedWorkspacePublicSkill')
			.mockResolvedValue({ id: 'index-public-1' })

		const result = await service.uploadWorkspacePublicRepositoryPackages('repo-public', {
			buffer: Buffer.from('zip-file')
		} as Express.Multer.File)

		expect(skillRepositoryService.findOneInOrganizationOrTenant).toHaveBeenCalledWith('repo-public')
		expect(workspaceRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Default Workspace',
				organizationId: 'org-1',
				ownerId: 'user-1',
				tenantId: 'tenant-1'
			})
		)
		expect(publishUploadedWorkspacePublicSkill).toHaveBeenCalledWith(
			expect.objectContaining({
				installDir: '/tmp/workspace-skills',
				organizationId: 'org-1',
				repositoryId: 'repo-public',
				tenantId: 'tenant-1',
				workspaceId: 'workspace-org-default'
			})
		)
		expect(cleanupExtractedSkillArchive).toHaveBeenCalledWith('/tmp/skill-archive')
		expect(result).toEqual([{ id: 'index-public-1' }])
	})

	it('uploads zip packages to the tenant-scoped workspace public repository without organization context', async () => {
		;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
		skillRepositoryService.findOneInOrganizationOrTenant.mockResolvedValue({
			id: 'repo-public-tenant',
			provider: 'workspace-public',
			organizationId: null
		})
		;(extractSkillsFromZip as jest.Mock).mockResolvedValue({
			tempDir: '/tmp/skill-archive-tenant',
			skills: [
				{
					name: 'Tenant Skill',
					description: 'Tenant scope skill',
					absolutePath: '/tmp/uploaded/tenant-skill',
					skillPath: 'tenant-skill'
				}
			]
		})
		const publishUploadedWorkspacePublicSkill = jest
			.spyOn(service as any, 'publishUploadedWorkspacePublicSkill')
			.mockResolvedValue({ id: 'index-public-tenant-1' })

		const result = await service.uploadWorkspacePublicRepositoryPackages('repo-public-tenant', {
			buffer: Buffer.from('zip-file')
		} as Express.Multer.File)

		expect(workspaceRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Tenant Skills Workspace',
				organizationId: null,
				ownerId: 'user-1',
				tenantId: 'tenant-1',
				settings: {
					system: {
						kind: 'tenant-default'
					}
				}
			})
		)
		expect(publishUploadedWorkspacePublicSkill).toHaveBeenCalledWith(
			expect.objectContaining({
				installDir: '/tmp/workspace-skills',
				organizationId: null,
				repositoryId: 'repo-public',
				tenantId: 'tenant-1',
				workspaceId: 'workspace-org-default'
			})
		)
		expect(cleanupExtractedSkillArchive).toHaveBeenCalledWith('/tmp/skill-archive-tenant')
		expect(result).toEqual([{ id: 'index-public-tenant-1' }])
	})

	it('rejects direct zip uploads for non workspace-public repositories', async () => {
		skillRepositoryService.findOneInOrganizationOrTenant.mockResolvedValue({
			id: 'repo-github',
			provider: 'github'
		})

		await expect(
			service.uploadWorkspacePublicRepositoryPackages('repo-github', {
				buffer: Buffer.from('zip-file')
			} as Express.Multer.File)
		).rejects.toThrow('Only workspace public repositories support direct zip uploads')
		expect(extractSkillsFromZip).not.toHaveBeenCalled()
		expect(installUploadedSkills).not.toHaveBeenCalled()
	})

	it('initializes the tenant-scoped workspace public repository and imports template bundles into the default source workspace', async () => {
		;(RequestContext.getOrganizationId as jest.Mock).mockReturnValue(null)
		xpertTemplateService.getTemplateSkillBundles.mockResolvedValue([
			{
				directoryPath: '/tmp/template-skill-bundles/claude-api-bundle',
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api'
			},
			{
				directoryPath: '/tmp/template-skill-bundles/github-bundle',
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fgithub'
			}
		])
		const ensureSharedSkillPackageFromTemplateBundle = jest
			.spyOn(service, 'ensureSharedSkillPackageFromTemplateBundle')
			.mockResolvedValue({ id: 'index-public-1' } as any)

		const result = await service.initializeWorkspacePublicRepository()

		expect(skillRepositoryService.ensureWorkspacePublicRepository).toHaveBeenCalledTimes(1)
		expect(workspaceRepository.create).toHaveBeenCalledWith(
			expect.objectContaining({
				name: 'Tenant Skills Workspace',
				organizationId: null,
				ownerId: 'user-1',
				tenantId: 'tenant-1',
				settings: {
					system: {
						kind: 'tenant-default'
					}
				}
			})
		)
		expect(ensureSharedSkillPackageFromTemplateBundle).toHaveBeenNthCalledWith(
			1,
			'workspace-org-default',
			{
				bundleRootPath: '/tmp/template-skill-bundles/claude-api-bundle',
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api'
			},
			{
				skipAccessCheck: true
			}
		)
		expect(ensureSharedSkillPackageFromTemplateBundle).toHaveBeenNthCalledWith(
			2,
			'workspace-org-default',
			{
				bundleRootPath: '/tmp/template-skill-bundles/github-bundle',
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fgithub'
			},
			{
				skipAccessCheck: true
			}
		)
		expect(result).toEqual({
			id: 'repo-public',
			provider: 'workspace-public'
		})
	})

	it('creates a workspace skill package with a single SKILL.md file and persisted metadata', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-create-'))
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		createSpy.mockImplementationOnce(async (item: any) => ({
			id: 'skill-created-1',
			...item
		}))

		const result = await service.createWorkspaceSkillPackage('workspace-1', {
			userIntent: 'Create a workspace helper',
			skillName: 'Workspace Skill',
			skillMarkdown:
				'---\nname: Workspace Skill\ndescription: Helps this workspace.\nversion: 1.0.0\ntags:\n  - workspace\n---\n# Workspace Skill\n'
		})

		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: 'workspace-1',
				name: 'Workspace Skill',
				visibility: 'private',
				packagePath: 'workspace-skill',
				metadata: expect.objectContaining({
					name: 'Workspace Skill',
					version: '1.0.0',
					tags: ['workspace'],
					source: 'file',
					skillPath: 'workspace-skill',
					skillMdPath: join(tempRoot, 'workspace-skill', 'SKILL.md')
				})
			})
		)
		await expect(readFile(join(tempRoot, 'workspace-skill', 'SKILL.md'), 'utf8')).resolves.toContain(
			'# Workspace Skill\n'
		)
		expect(result).toEqual(
			expect.objectContaining({
				packagePath: 'workspace-skill',
				skillMdPath: join(tempRoot, 'workspace-skill', 'SKILL.md'),
				skillPackage: expect.objectContaining({
					id: 'skill-created-1',
					workspaceId: 'workspace-1'
				})
			})
		)
	})

	it('adds a numeric suffix when creating a workspace skill package with an existing slug', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-create-dup-'))
		await mkdir(join(tempRoot, 'workspace-skill'), { recursive: true })
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		createSpy.mockImplementationOnce(async (item: any) => item)

		const result = await service.createWorkspaceSkillPackage('workspace-1', {
			userIntent: 'Create a workspace helper',
			skillName: 'Workspace Skill',
			skillMarkdown: '---\nname: Workspace Skill\ndescription: Helps this workspace.\n---\n# Workspace Skill\n'
		})

		expect(result.packagePath).toBe('workspace-skill-2')
		await expect(readFile(join(tempRoot, 'workspace-skill-2', 'SKILL.md'), 'utf8')).resolves.toContain(
			'# Workspace Skill\n'
		)
	})

	it('rejects workspace skill creation when SKILL.md frontmatter is missing required fields', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-create-invalid-'))
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)

		await expect(
			service.createWorkspaceSkillPackage('workspace-1', {
				userIntent: 'Create a workspace helper',
				skillName: 'Workspace Skill',
				skillMarkdown: '---\nname: Workspace Skill\n---\n# Workspace Skill\n'
			})
		).rejects.toThrow('SKILL.md frontmatter must include name and description')
		expect(createSpy).not.toHaveBeenCalled()
	})

	it('publishes a template skill bundle from a directory and excludes bundle.yaml from installed files', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-template-bundle-'))
		const workspaceRoot = join(tempRoot, 'workspace')
		const sharedRoot = join(tempRoot, 'shared')
		const bundleRoot = join(tempRoot, 'bundle')
		const sharedSkillId = 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api'
		await mkdir(bundleRoot, { recursive: true })
		await writeFile(
			join(bundleRoot, 'bundle.yaml'),
			'provider: github\nrepositoryName: anthropics/skills\nskillId: skills/claude-api\n',
			'utf8'
		)
		await writeFile(
			join(bundleRoot, 'SKILL.md'),
			'---\nname: Claude API\ndescription: Bundle skill.\nversion: 1.0.0\ntags:\n  - api\n---\n# Claude API\n',
			'utf8'
		)
		await writeFile(join(bundleRoot, 'guide.md'), 'bundle guide\n', 'utf8')
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(workspaceRoot)
		;(getOrganizationSharedSkillPath as jest.Mock).mockImplementation(
			(_tenantId: string, _organizationId: string, id: string) => join(sharedRoot, id)
		)
		createSpy.mockImplementationOnce(async (item: any) => ({
			id: 'skill-created-1',
			...item
		}))

		await service.ensureSharedSkillPackageFromTemplateBundle('workspace-1', {
			bundleRootPath: bundleRoot,
			sharedSkillId
		})

		expect(createSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				workspaceId: 'workspace-1',
				name: 'Claude API',
				packagePath: 'claude-api',
				metadata: expect.objectContaining({
					name: 'Claude API',
					version: '1.0.0',
					tags: ['api']
				})
			})
		)
		await expect(readFile(join(workspaceRoot, 'claude-api', 'SKILL.md'), 'utf8')).resolves.toContain('# Claude API\n')
		await expect(readFile(join(workspaceRoot, 'claude-api', 'bundle.yaml'), 'utf8')).rejects.toThrow()
		await expect(readFile(join(sharedRoot, sharedSkillId, 'guide.md'), 'utf8')).resolves.toBe('bundle guide\n')
		await expect(readFile(join(sharedRoot, sharedSkillId, 'bundle.yaml'), 'utf8')).rejects.toThrow()
		expect(skillIndexService.create).toHaveBeenCalledWith(
			expect.objectContaining({
				repositoryId: 'repo-public',
				skillId: sharedSkillId,
				name: 'Claude API',
				description: 'Bundle skill.'
			})
		)
	})

	it('lists workspace skill files from the installed package root', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-files-'))
		const skillRoot = join(tempRoot, 'weather')
		await mkdir(join(skillRoot, 'docs'), { recursive: true })
		await writeFile(join(skillRoot, 'SKILL.md'), '# Weather\n', 'utf8')
		await writeFile(join(skillRoot, 'docs', 'readme.md'), 'hello', 'utf8')

		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-1',
			tenantId: 'tenant-1',
			workspaceId: 'workspace-1',
			packagePath: 'weather'
		})

		const result = await service.getSkillPackageFiles('workspace-1', 'skill-1')

		expect(result).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					filePath: 'SKILL.md',
					fullPath: 'SKILL.md'
				}),
				expect.objectContaining({
					filePath: 'docs',
					fullPath: 'docs',
					hasChildren: true,
					children: null
				})
			])
		)
	})

	it('reads and saves editable skill files', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-read-save-'))
		const skillRoot = join(tempRoot, 'weather')
		await mkdir(skillRoot, { recursive: true })
		await writeFile(join(skillRoot, 'SKILL.md'), '# Before\n', 'utf8')

		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-1',
			tenantId: 'tenant-1',
			workspaceId: 'workspace-1',
			packagePath: 'weather'
		})

		const readResult = await service.readSkillPackageFile('workspace-1', 'skill-1', 'SKILL.md')
		expect(readResult.contents).toBe('# Before\n')

		const saveResult = await service.saveSkillPackageFile('workspace-1', 'skill-1', 'SKILL.md', '# After\n')
		expect(saveResult.contents).toBe('# After\n')
		await expect(readFile(join(skillRoot, 'SKILL.md'), 'utf8')).resolves.toBe('# After\n')
	})

	it('allows editing .env files from the supported text whitelist', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-env-'))
		const skillRoot = join(tempRoot, 'weather')
		await mkdir(skillRoot, { recursive: true })
		await writeFile(join(skillRoot, '.env'), 'TOKEN=before\n', 'utf8')

		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-1',
			tenantId: 'tenant-1',
			workspaceId: 'workspace-1',
			packagePath: 'weather'
		})

		const saveResult = await service.saveSkillPackageFile('workspace-1', 'skill-1', '.env', 'TOKEN=after\n')
		expect(saveResult.contents).toBe('TOKEN=after\n')
	})

	it('rejects skill file path traversal attempts', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-path-'))
		const skillRoot = join(tempRoot, 'weather')
		await mkdir(skillRoot, { recursive: true })

		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-1',
			tenantId: 'tenant-1',
			workspaceId: 'workspace-1',
			packagePath: 'weather'
		})

		await expect(service.readSkillPackageFile('workspace-1', 'skill-1', '../secret.txt')).rejects.toThrow(
			'Invalid skill file path'
		)
	})

	it('rejects saving non-editable skill files', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-binary-'))
		const skillRoot = join(tempRoot, 'weather')
		await mkdir(skillRoot, { recursive: true })
		await writeFile(join(skillRoot, 'icon.png'), 'binary', 'utf8')

		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(tempRoot)
		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-1',
			tenantId: 'tenant-1',
			workspaceId: 'workspace-1',
			packagePath: 'weather'
		})

		await expect(service.saveSkillPackageFile('workspace-1', 'skill-1', 'icon.png', 'test')).rejects.toThrow(
			'This file type cannot be edited'
		)
	})

	it('shares a workspace uploaded skill into the organization market and reuses the same shared skill id on republish', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-share-'))
		const workspaceRoot = join(tempRoot, 'workspace')
		const sourceRoot = join(workspaceRoot, 'weather')
		const sharedRoot = join(tempRoot, 'shared')
		await mkdir(sourceRoot, { recursive: true })
		await writeFile(join(sourceRoot, 'SKILL.md'), '# Weather\n', 'utf8')
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(workspaceRoot)
		;(getOrganizationSharedSkillPath as jest.Mock).mockImplementation(
			(_tenantId: string, _organizationId: string, sharedSkillId: string) => join(sharedRoot, sharedSkillId)
		)

		const skillPackage = {
			id: 'skill-local-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			workspaceId: 'workspace-1',
			name: 'weather',
			packagePath: 'weather',
			metadata: {
				name: 'weather',
				visibility: 'private'
			}
		}

		;(service as any).findOne = jest
			.fn()
			.mockResolvedValueOnce(skillPackage)
			.mockResolvedValueOnce({
				...skillPackage,
				publishAt: new Date('2026-04-09T12:00:00.000Z'),
				sharedSkillId: 'shared-skill-123'
			})
			.mockResolvedValueOnce({
				...skillPackage,
				sharedSkillId: 'shared-skill-123',
				publishAt: new Date('2026-04-09T12:30:00.000Z')
			})

		await service.shareSkillPackage('workspace-1', 'skill-local-1', {
			displayName: 'Weather Helper',
			description: 'Shareable weather helper',
			tags: ['weather', 'ops'],
			version: '1.0.0',
			license: 'MIT'
		})

		expect(skillRepositoryService.ensureWorkspacePublicRepository).toHaveBeenCalled()
		expect(skillIndexService.create).toHaveBeenCalledWith(
			expect.objectContaining({
				repositoryId: 'repo-public',
				name: 'Weather Helper',
				description: 'Shareable weather helper',
				tags: ['weather', 'ops'],
				version: '1.0.0'
			})
		)
		expect(service.update).toHaveBeenCalledWith(
			'skill-local-1',
			expect.objectContaining({
				sharedSkillId: expect.stringMatching(/^shared-skill-/),
				sharedPackagePath: expect.stringMatching(/^shared-skill-/),
				publishAt: expect.any(Date)
			})
		)

		const firstSharedSkillId = (service.update as jest.Mock).mock.calls[0][1].sharedSkillId
		await expect(readFile(join(sharedRoot, firstSharedSkillId, 'SKILL.md'), 'utf8')).resolves.toBe('# Weather\n')

		;(service as any).findOne = jest
			.fn()
			.mockResolvedValueOnce({
				...skillPackage,
				sharedSkillId: firstSharedSkillId,
				sharedPackagePath: firstSharedSkillId,
				publishAt: new Date('2026-04-09T12:00:00.000Z')
			})
			.mockResolvedValueOnce({
				...skillPackage,
				sharedSkillId: firstSharedSkillId,
				sharedPackagePath: firstSharedSkillId,
				publishAt: new Date('2026-04-09T13:00:00.000Z')
			})
		skillIndexService.findAll.mockResolvedValueOnce({
			items: [{ id: 'shared-index-1' }]
		})
		await writeFile(join(sourceRoot, 'SKILL.md'), '# Weather v2\n', 'utf8')

		await service.shareSkillPackage('workspace-1', 'skill-local-1', {
			displayName: 'Weather Helper',
			description: 'Shareable weather helper v2',
			tags: ['weather', 'ops'],
			version: '1.1.0',
			license: 'MIT'
		})

		expect(skillIndexService.create).toHaveBeenLastCalledWith(
			expect.objectContaining({
				id: 'shared-index-1',
				skillId: firstSharedSkillId,
				version: '1.1.0'
			})
		)
		expect((service.update as jest.Mock).mock.calls[1][1].sharedSkillId).toBe(firstSharedSkillId)
		await expect(readFile(join(sharedRoot, firstSharedSkillId, 'SKILL.md'), 'utf8')).resolves.toBe('# Weather v2\n')
	})

	it('rejects sharing a repository installed skill', async () => {
		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-indexed',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			workspaceId: 'workspace-1',
			skillIndexId: 'index-1',
			metadata: {
				name: 'indexed-skill',
				visibility: 'private'
			}
		})

		await expect(
			service.shareSkillPackage('workspace-1', 'skill-indexed', {
				displayName: 'Indexed Skill',
				description: 'Cannot share again',
				tags: []
			})
		).rejects.toThrow('Only workspace uploaded skills can be shared')
	})

	it('removes shared snapshot and public index when uninstalling a shared source skill', async () => {
		tempRoot = await mkdtemp(join(tmpdir(), 'skill-package-uninstall-share-'))
		const workspaceRoot = join(tempRoot, 'workspace')
		const installRoot = join(workspaceRoot, 'weather')
		const sharedRoot = join(tempRoot, 'shared')
		const sharedSkillId = 'shared-skill-keep'
		await mkdir(installRoot, { recursive: true })
		await mkdir(join(sharedRoot, sharedSkillId), { recursive: true })
		await writeFile(join(sharedRoot, sharedSkillId, 'SKILL.md'), '# Shared\n', 'utf8')
		;(getWorkspaceSkillsRoot as jest.Mock).mockReturnValue(workspaceRoot)
		;(getOrganizationSharedSkillPath as jest.Mock).mockImplementation(
			(_tenantId: string, _organizationId: string, id: string) => join(sharedRoot, id)
		)

		;(service as any).findOne = jest.fn().mockResolvedValue({
			id: 'skill-local-1',
			tenantId: 'tenant-1',
			organizationId: 'org-1',
			workspaceId: 'workspace-1',
			packagePath: 'weather',
			sharedSkillId,
			sharedPackagePath: sharedSkillId,
			metadata: {
				name: 'weather',
				visibility: 'private'
			}
		})
		skillRepositoryService.findAll.mockResolvedValueOnce({
			items: [{ id: 'repo-public', provider: 'workspace-public' }]
		})
		skillIndexService.findAll.mockResolvedValueOnce({
			items: [{ id: 'shared-index-1' }]
		})

		await service.uninstallSkillPackageInWorkspace('workspace-1', 'skill-local-1')

		expect(skillIndexService.softDelete).toHaveBeenCalledWith('shared-index-1')
		await expect(readFile(join(sharedRoot, sharedSkillId, 'SKILL.md'), 'utf8')).rejects.toThrow()
	})
})
