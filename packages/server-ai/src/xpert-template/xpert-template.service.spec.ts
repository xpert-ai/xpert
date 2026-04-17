import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { LanguagesEnum } from '@xpert-ai/contracts'

jest.mock('../skill-repository/skill-repository.service', () => ({
	SkillRepositoryService: class SkillRepositoryService {}
}))

jest.mock('../skill-repository/repository-index/skill-repository-index.service', () => ({
	SkillRepositoryIndexService: class SkillRepositoryIndexService {}
}))

jest.mock('@xpert-ai/server-config', () => ({
	ConfigService: class ConfigService {}
}))

jest.mock('@xpert-ai/server-core', () => ({
	TenantBaseEntity: class TenantBaseEntity {},
	TenantAwareCrudService: class TenantAwareCrudService<T> {
		constructor(protected readonly repository: unknown) {}

		async findOneOrFailByWhereOptions() {
			return { record: null }
		}

		async update() {
			return undefined
		}

		async create() {
			return undefined
		}

		async findAll() {
			return { items: [] }
		}
	}
}))

import { XpertTemplateService } from './xpert-template.service'

describe('XpertTemplateService', () => {
	const cleanupPaths = new Set<string>()

	afterEach(() => {
		for (const targetPath of cleanupPaths) {
			rmSync(targetPath, { recursive: true, force: true })
		}
		cleanupPaths.clear()
		jest.restoreAllMocks()
	})

	it('uses /var/lib/xpert/data/xpert-template when env is not configured', () => {
		const workspaceRoot = createTempDir()
		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: '/var/lib/xpert/data/'
		})

		expect((service as any).getExternalTemplateRoot()).toBe('/var/lib/xpert/data/xpert-template')
	})

	it('prefers XPERT_TEMPLATE_DIR when it is configured', () => {
		const workspaceRoot = createTempDir()
		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: '/var/lib/xpert/data/',
			env: {
				XPERT_TEMPLATE_DIR: '/tmp/custom-xpert-template'
			}
		})

		expect((service as any).getExternalTemplateRoot()).toBe('/tmp/custom-xpert-template')
	})

	it('initializes the external template directory without overwriting existing files', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'custom-template-root')
		const builtinRoot = seedBuiltinTemplates(workspaceRoot)

		mkdirSync(join(externalRoot, 'templates'), { recursive: true })
		writeJson(join(externalRoot, 'templates.json'), {
			templates: {
				'en-US': {
					categories: ['custom'],
					recommendedApps: [{ id: 'template-1', name: 'External Template' }]
				}
			},
			details: {}
		})
		writeFileSync(join(externalRoot, 'templates', 'template-1.yaml'), 'source: external-template\n', 'utf8')

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()

		expect(readJson(join(externalRoot, 'templates.json'))).toEqual({
			templates: {
				'en-US': {
					categories: ['custom'],
					recommendedApps: [{ id: 'template-1', name: 'External Template' }]
				}
			},
			details: {}
		})
		expect(readFileSync(join(externalRoot, 'templates', 'template-1.yaml'), 'utf8')).toBe(
			'source: external-template\n'
		)
		expect(readJson(join(externalRoot, 'mcp-templates.json'))).toEqual(
			readJson(join(builtinRoot, 'mcp-templates.json'))
		)
		expect(readJson(join(externalRoot, 'knowledge-pipelines.json'))).toEqual(
			readJson(join(builtinRoot, 'knowledge-pipelines.json'))
		)
		expect(readFileSync(join(externalRoot, 'skills-market.yaml'), 'utf8')).toBe(
			readFileSync(join(builtinRoot, 'skills-market.yaml'), 'utf8')
		)
		expect(readFileSync(join(externalRoot, 'skill-repositories.yaml'), 'utf8')).toBe(
			readFileSync(join(builtinRoot, 'skill-repositories.yaml'), 'utf8')
		)
		expect(readFileSync(join(externalRoot, 'workspace-defaults.yaml'), 'utf8')).toBe(
			readFileSync(join(builtinRoot, 'workspace-defaults.yaml'), 'utf8')
		)
		expect(readFileSync(join(externalRoot, 'pipelines', 'pipeline-1.yaml'), 'utf8')).toBe(
			readFileSync(join(builtinRoot, 'pipelines', 'pipeline-1.yaml'), 'utf8')
		)
	})

	it('reads templates and yaml assets only from the external directory after initialization', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')

		seedBuiltinTemplates(workspaceRoot, {
			templatesJson: {
				templates: {
					'en-US': {
						categories: ['builtin'],
						recommendedApps: [{ id: 'template-1', name: 'Built-in Template' }]
					}
				},
				details: {}
			},
			mcpTemplatesJson: {
				'en-US': {
					categories: ['builtin'],
					templates: [{ id: 'mcp-1', name: 'Built-in MCP' }]
				}
			},
			knowledgePipelinesJson: {
				'en-US': {
					categories: ['builtin'],
					templates: [{ id: 'pipeline-1', name: 'Built-in Pipeline' }]
				}
			},
			templateYaml: 'source: builtin-template\n',
			pipelineYaml: 'source: builtin-pipeline\n'
		})

		mkdirSync(join(externalRoot, 'templates'), { recursive: true })
		mkdirSync(join(externalRoot, 'pipelines'), { recursive: true })
		writeJson(join(externalRoot, 'templates.json'), {
			templates: {
				'en-US': {
					categories: ['external'],
					recommendedApps: [{ id: 'template-1', name: 'External Template' }]
				}
			},
			details: {}
		})
		writeJson(join(externalRoot, 'mcp-templates.json'), {
			'en-US': {
				categories: ['external'],
				templates: [{ id: 'mcp-1', name: 'External MCP' }]
			}
		})
		writeJson(join(externalRoot, 'knowledge-pipelines.json'), {
			'en-US': {
				categories: ['external'],
				templates: [{ id: 'pipeline-1', name: 'External Pipeline' }]
			}
		})
		writeFileSync(
			join(externalRoot, 'skills-market.yaml'),
			[
				'en-US:',
				'  featured:',
				'    - provider: github',
				'      repositoryName: anthropics/skills',
				'      skillId: skills/claude-api',
				'      badge: Official Picks',
				'  filters:',
				'    roles:',
				'      label: Roles',
				'      options:',
				'        - value: all',
				'          label: All roles',
				'    appTypes:',
				'      label: Application types',
				'      options:',
				'        - value: all',
				'          label: All types',
				'    hot:',
				'      label: Trending',
				'      options:',
				'        - value: all',
				'          label: Default'
			].join('\n'),
			'utf8'
		)
		writeFileSync(join(externalRoot, 'templates', 'template-1.yaml'), 'source: external-template\n', 'utf8')
		writeFileSync(join(externalRoot, 'pipelines', 'pipeline-1.yaml'), 'source: external-pipeline\n', 'utf8')

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()

		const templatesFile = await service.readTemplatesFile()
		const mcpTemplates = await service.readMCPTemplates()
		const templateDetail = await service.getTemplateDetail('template-1', LanguagesEnum.English)
		const knowledgePipeline = await service.getKnowledgePipeline(LanguagesEnum.English, 'pipeline-1')
		const skillsMarket = await service.getSkillsMarket(LanguagesEnum.English)
		const workspaceDefaults = await service.readWorkspaceDefaults()

		expect(templatesFile.templates['en-US'].categories).toEqual(['external'])
		expect(mcpTemplates['en-US'].templates[0].name).toBe('External MCP')
		expect(templateDetail.name).toBe('External Template')
		expect(templateDetail.export_data).toBe('source: external-template\n')
		expect(knowledgePipeline.name).toBe('External Pipeline')
		expect(knowledgePipeline.export_data).toBe('source: external-pipeline\n')
		expect(skillsMarket.filters.roles.label).toBe('Roles')
		expect(skillsMarket.featured).toEqual([])
		expect(workspaceDefaults.userDefault.skills).toEqual([])
	})

	it('throws a clear error when an external template file is missing after initialization', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')

		seedBuiltinTemplates(workspaceRoot)

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()
		unlinkSync(join(externalRoot, 'templates.json'))

		await expect(service.readTemplatesFile()).rejects.toThrow(externalRoot)
		await expect(service.readTemplatesFile()).rejects.toThrow('templates.json')
	})

	it('preserves featured avatars from skills market config when resolving featured skills', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')

		seedBuiltinTemplates(workspaceRoot)
		mkdirSync(externalRoot, { recursive: true })
		writeFileSync(
			join(externalRoot, 'skills-market.yaml'),
			[
				'en-US:',
				'  featured:',
				'    - provider: github',
				'      repositoryName: anthropics/skills',
				'      skillId: skills/claude-api',
				'      avatar:',
				'        type: font',
				'        value: ri-code-box-line',
				'        size: 22',
				'  filters:',
				'    roles:',
				'      label: Roles',
				'      options: []',
				'    appTypes:',
				'      label: Application types',
				'      options: []',
				'    hot:',
				'      label: Trending',
				'      options: []'
			].join('\n'),
			'utf8'
		)

		const { service, skillRepositoryService, skillRepositoryIndexService } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
			items: [
				{
					id: 'repo-1',
					provider: 'github',
					name: 'anthropics/skills'
				}
			]
		})
		skillRepositoryIndexService.findAllInOrganizationOrTenant.mockResolvedValue({
			items: [
				{
					id: 'skill-1',
					repositoryId: 'repo-1',
					skillId: 'skills/claude-api',
					skillPath: 'skills/claude-api',
					name: 'Claude API',
					repository: {
						id: 'repo-1',
						provider: 'github',
						name: 'anthropics/skills'
					}
				}
			]
		})

		await service.onModuleInit()

		const skillsMarket = await service.getSkillsMarket(LanguagesEnum.English)

		expect(skillsMarket.featured).toHaveLength(1)
		expect(skillsMarket.featured[0].avatar).toEqual({
			type: 'font',
			value: 'ri-code-box-line',
			size: 22
		})
		expect(skillsMarket.featured[0].skill.id).toBe('skill-1')
	})

	it('normalizes workspace defaults config and trims invalid entries', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')

		seedBuiltinTemplates(workspaceRoot)
		mkdirSync(externalRoot, { recursive: true })
		writeFileSync(
			join(externalRoot, 'workspace-defaults.yaml'),
			[
				'userDefault:',
				'  skills:',
				'    - provider: github',
				'      repositoryName: anthropics/skills',
				'      skillId: skills/claude-api',
				'    - provider: "  "',
				'      repositoryName: ignored/repo',
				'      skillId: ignored-skill',
				'    - provider: clawhub',
				'      repositoryName: clawhub/official',
				'      skillId: mcporter'
			].join('\n'),
			'utf8'
		)

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()

		await expect(service.readWorkspaceDefaults()).resolves.toEqual({
			userDefault: {
				skills: [
					{
						provider: 'github',
						repositoryName: 'anthropics/skills',
						skillId: 'skills/claude-api'
					},
					{
						provider: 'clawhub',
						repositoryName: 'clawhub/official',
						skillId: 'mcporter'
					}
				]
			}
		})
	})

	it('normalizes skill repository config and trims invalid entries', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')

		seedBuiltinTemplates(workspaceRoot)
		mkdirSync(externalRoot, { recursive: true })
		writeFileSync(
			join(externalRoot, 'skill-repositories.yaml'),
			[
				'repositories:',
				'  - name: " anthropics/skills "',
				'    provider: " github "',
				'    options:',
				'      url: https://github.com/anthropics/skills',
				'      branch: main',
				'  - provider: github',
				'  - name: clawhub/official',
				'    provider: clawhub',
				'    credentials: invalid',
				'  - name: clawhub/official',
				'    provider: clawhub',
				'    credentials:',
				'      token: abc'
			].join('\n'),
			'utf8'
		)

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()

		await expect(service.readSkillRepositories()).resolves.toEqual({
			repositories: [
				{
					name: 'anthropics/skills',
					provider: 'github',
					options: {
						url: 'https://github.com/anthropics/skills',
						branch: 'main'
					}
				},
				{
					name: 'clawhub/official',
					provider: 'clawhub',
					credentials: {
						token: 'abc'
					}
				}
			]
		})
	})

	it('keeps workspace default skill refs aligned with skills-market featured refs', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')

		seedBuiltinTemplates(workspaceRoot)
		mkdirSync(externalRoot, { recursive: true })
		writeFileSync(
			join(externalRoot, 'skills-market.yaml'),
			[
				'en-US:',
				'  featured:',
				'    - provider: github',
				'      repositoryName: anthropics/skills',
				'      skillId: skills/claude-api',
				'  filters:',
				'    roles:',
				'      label: Roles',
				'      options:',
				'        - value: all',
				'          label: All roles',
				'    appTypes:',
				'      label: Application types',
				'      options:',
				'        - value: all',
				'          label: All types',
				'    hot:',
				'      label: Trending',
				'      options:',
				'        - value: all',
				'          label: Default'
			].join('\n'),
			'utf8'
		)
		writeFileSync(
			join(externalRoot, 'workspace-defaults.yaml'),
			[
				'userDefault:',
				'  skills:',
				'    - provider: github',
				'      repositoryName: anthropics/skills',
				'      skillId: skills/claude-api',
				'    - provider: clawhub',
				'      repositoryName: clawhub/official',
				'      skillId: mcporter'
			].join('\n'),
			'utf8'
		)

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()

		await expect(service.getUserDefaultSkillRefs()).resolves.toEqual([
			{
				provider: 'github',
				repositoryName: 'anthropics/skills',
				skillId: 'skills/claude-api'
			}
		])
	})

	it('parses template skill bundle directories using bundle.yaml', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')
		const bundleRoot = join(externalRoot, 'skill-packages', 'claude-api-bundle')

		seedBuiltinTemplates(workspaceRoot)
		mkdirSync(bundleRoot, { recursive: true })
		writeJson(join(externalRoot, 'templates.json'), {
			templates: {},
			details: {}
		})
		writeJson(join(externalRoot, 'mcp-templates.json'), {})
		writeJson(join(externalRoot, 'knowledge-pipelines.json'), {})
		writeFileSync(join(externalRoot, 'skills-market.yaml'), 'en-US:\n  featured: []\n  filters:\n    roles:\n      label: Roles\n      options: []\n    appTypes:\n      label: Application types\n      options: []\n    hot:\n      label: Trending\n      options: []', 'utf8')
		writeFileSync(join(externalRoot, 'workspace-defaults.yaml'), 'userDefault:\n  skills: []', 'utf8')
		writeFileSync(
			join(bundleRoot, 'bundle.yaml'),
			'provider: github\nrepositoryName: anthropics/skills\nskillId: skills/claude-api\n',
			'utf8'
		)
		writeFileSync(join(bundleRoot, 'SKILL.md'), '---\nname: Claude API\ndescription: Example\n---\n', 'utf8')
		writeFileSync(join(externalRoot, 'skill-packages', 'README.md'), 'ignore me', 'utf8')

		const { service } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		await service.onModuleInit()

		await expect(service.getTemplateSkillBundles()).resolves.toEqual([
			{
				directoryName: 'claude-api-bundle',
				directoryPath: bundleRoot,
				sharedSkillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
				ref: {
					provider: 'github',
					repositoryName: 'anthropics/skills',
					skillId: 'skills/claude-api'
				}
			}
		])
	})

	it('reuses repository path trimming when resolving default workspace skill refs', async () => {
		const workspaceRoot = createTempDir()
		const { service, skillRepositoryIndexService, skillRepositoryService } = createService({
			serverRoot: workspaceRoot,
			dataPath: createTempDir()
		})

		skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
			items: [
				{
					id: 'repo-org',
					provider: 'github',
					name: 'obra/superpowers',
					organizationId: 'org-1',
					options: {
						path: 'skills'
					}
				},
				{
					id: 'repo-tenant',
					provider: 'github',
					name: 'obra/superpowers',
					organizationId: null,
					options: {
						path: 'skills'
					}
				}
			]
		})
		skillRepositoryIndexService.findAllInOrganizationOrTenant
			.mockResolvedValueOnce({ items: [] })
			.mockResolvedValueOnce({
				items: [
					{
						id: 'skill-1',
						repositoryId: 'repo-org',
						skillId: 'mcporter',
						skillPath: 'mcporter',
						name: 'MCPorter',
						repository: {
							id: 'repo-org',
							provider: 'github',
							name: 'obra/superpowers'
						}
					}
				]
			})

		const result = await service.resolveSkillRefs([
			{
				provider: 'github',
				repositoryName: 'obra/superpowers',
				skillId: 'skills/mcporter'
			}
		])

		expect(skillRepositoryIndexService.findAllInOrganizationOrTenant).toHaveBeenNthCalledWith(1, {
			where: {
				repositoryId: 'repo-org',
				skillId: 'skills/mcporter'
			},
			relations: ['repository'],
			take: 1,
			order: {
				updatedAt: 'DESC'
			}
		})
		expect(skillRepositoryIndexService.findAllInOrganizationOrTenant).toHaveBeenNthCalledWith(2, {
			where: {
				repositoryId: 'repo-org',
				skillId: 'mcporter'
			},
			relations: ['repository'],
			take: 1,
			order: {
				updatedAt: 'DESC'
			}
		})
		expect(result).toEqual([
			{
				ref: {
					provider: 'github',
					repositoryName: 'obra/superpowers',
					skillId: 'skills/mcporter'
				},
				skill: expect.objectContaining({
					id: 'skill-1',
					repositoryId: 'repo-org',
					skillId: 'mcporter'
				})
			}
		])
	})

	it('prefers template bundle backed public repository skills for matching refs', async () => {
		const workspaceRoot = createTempDir()
		const dataRoot = createTempDir()
		const externalRoot = join(dataRoot, 'external-templates')
		const bundleRoot = join(externalRoot, 'skill-packages', 'claude-api-bundle')

		seedBuiltinTemplates(workspaceRoot)
		mkdirSync(bundleRoot, { recursive: true })
		writeJson(join(externalRoot, 'templates.json'), {
			templates: {},
			details: {}
		})
		writeJson(join(externalRoot, 'mcp-templates.json'), {})
		writeJson(join(externalRoot, 'knowledge-pipelines.json'), {})
		writeFileSync(join(externalRoot, 'skills-market.yaml'), 'en-US:\n  featured: []\n  filters:\n    roles:\n      label: Roles\n      options: []\n    appTypes:\n      label: Application types\n      options: []\n    hot:\n      label: Trending\n      options: []', 'utf8')
		writeFileSync(join(externalRoot, 'workspace-defaults.yaml'), 'userDefault:\n  skills: []', 'utf8')
		writeFileSync(
			join(bundleRoot, 'bundle.yaml'),
			'provider: github\nrepositoryName: anthropics/skills\nskillId: skills/claude-api\n',
			'utf8'
		)
		writeFileSync(join(bundleRoot, 'SKILL.md'), '---\nname: Claude API\ndescription: Example\n---\n', 'utf8')

		const { service, skillRepositoryIndexService, skillRepositoryService } = createService({
			serverRoot: workspaceRoot,
			dataPath: join(dataRoot, 'fallback-data'),
			env: {
				XPERT_TEMPLATE_DIR: externalRoot
			}
		})

		skillRepositoryService.findAllInOrganizationOrTenant.mockResolvedValue({
			items: [
				{
					id: 'repo-public',
					provider: 'workspace-public',
					name: 'Workspace Shared Skills',
					organizationId: 'org-1'
				},
				{
					id: 'repo-github',
					provider: 'github',
					name: 'anthropics/skills',
					organizationId: 'org-1'
				}
			]
		})
		skillRepositoryIndexService.findAllInOrganizationOrTenant.mockResolvedValueOnce({
			items: [
				{
					id: 'skill-public-1',
					repositoryId: 'repo-public',
					skillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
					skillPath: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api',
					name: 'Claude API',
					repository: {
						id: 'repo-public',
						provider: 'workspace-public',
						name: 'Workspace Shared Skills'
					}
				}
			]
		})

		await service.onModuleInit()

		const result = await service.resolveSkillRefs([
			{
				provider: 'github',
				repositoryName: 'anthropics/skills',
				skillId: 'skills/claude-api'
			}
		])

		expect(skillRepositoryIndexService.findAllInOrganizationOrTenant).toHaveBeenCalledWith({
			where: {
				repositoryId: 'repo-public',
				skillId: 'template-bundle__github__anthropics%2Fskills__skills%2Fclaude-api'
			},
			relations: ['repository'],
			take: 1,
			order: {
				updatedAt: 'DESC'
			}
		})
		expect(result).toEqual([
			{
				ref: {
					provider: 'github',
					repositoryName: 'anthropics/skills',
					skillId: 'skills/claude-api'
				},
				skill: expect.objectContaining({
					id: 'skill-public-1',
					repositoryId: 'repo-public'
				})
			}
		])
	})

	function createService({
		serverRoot,
		dataPath,
		env = {}
	}: {
		serverRoot: string
		dataPath: string
		env?: Record<string, string>
	}) {
		const cache = new Map<string, unknown>()
		const skillRepositoryService = {
			findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [] })
		}
		const skillRepositoryIndexService = {
			findAllInOrganizationOrTenant: jest.fn().mockResolvedValue({ items: [] })
		}
		const cacheManager = {
			get: jest.fn(async (key: string) => cache.get(key)),
			set: jest.fn(async (key: string, value: unknown) => {
				cache.set(key, value)
			})
		}
		const service = new XpertTemplateService(
			{} as any,
			skillRepositoryService as any,
			skillRepositoryIndexService as any
		)

		;(service as any).configService = {
			assetOptions: {
				serverRoot,
				dataPath
			},
			environment: {
				env
			}
		}
		;(service as any).cacheManager = cacheManager

		jest.spyOn(service as any, 'findOneOrFailByWhereOptions').mockResolvedValue({
			record: {
				id: 'record-1',
				visitCount: 1
			}
		})
		jest.spyOn(service as any, 'update').mockResolvedValue(undefined)
		jest.spyOn(service as any, 'create').mockResolvedValue(undefined)
		jest.spyOn(service as any, 'findAll').mockResolvedValue({ items: [] })

		return { service, cacheManager, skillRepositoryService, skillRepositoryIndexService }
	}

	function createTempDir() {
		const directory = mkdtempSync(join(tmpdir(), 'xpert-template-service-'))
		cleanupPaths.add(directory)
		return directory
	}

	function seedBuiltinTemplates(
		serverRoot: string,
		overrides: {
			templatesJson?: Record<string, unknown>
			mcpTemplatesJson?: Record<string, unknown>
			knowledgePipelinesJson?: Record<string, unknown>
			skillsMarketYaml?: string
			skillRepositoriesYaml?: string
			workspaceDefaultsYaml?: string
			templateYaml?: string
			pipelineYaml?: string
		} = {}
	) {
		const builtinRoot = join(serverRoot, 'packages', 'server-ai', 'src', 'xpert-template')
		mkdirSync(join(builtinRoot, 'templates'), { recursive: true })
		mkdirSync(join(builtinRoot, 'pipelines'), { recursive: true })
		mkdirSync(join(builtinRoot, 'skill-packages'), { recursive: true })

		writeJson(
			join(builtinRoot, 'templates.json'),
			overrides.templatesJson ?? {
				templates: {
					'en-US': {
						categories: ['builtin'],
						recommendedApps: [{ id: 'template-1', name: 'Built-in Template' }]
					}
				},
				details: {}
			}
		)
		writeJson(
			join(builtinRoot, 'mcp-templates.json'),
			overrides.mcpTemplatesJson ?? {
				'en-US': {
					categories: ['builtin'],
					templates: [{ id: 'mcp-1', name: 'Built-in MCP' }]
				}
			}
		)
		writeJson(
			join(builtinRoot, 'knowledge-pipelines.json'),
			overrides.knowledgePipelinesJson ?? {
				'en-US': {
					categories: ['builtin'],
					templates: [{ id: 'pipeline-1', name: 'Built-in Pipeline' }]
				}
			}
		)
		writeFileSync(
			join(builtinRoot, 'skills-market.yaml'),
			overrides.skillsMarketYaml ??
				[
					'en-US:',
					'  featured: []',
					'  filters:',
					'    roles:',
					'      label: Roles',
					'      options: []',
					'    appTypes:',
					'      label: Application types',
					'      options: []',
					'    hot:',
					'      label: Trending',
					'      options: []'
				].join('\n'),
			'utf8'
		)
		writeFileSync(
			join(builtinRoot, 'skill-repositories.yaml'),
			overrides.skillRepositoriesYaml ??
				[
					'repositories:',
					'  - name: anthropics/skills',
					'    provider: github',
					'    options:',
					'      url: https://github.com/anthropics/skills',
					'      branch: main',
					'      path: skills'
				].join('\n'),
			'utf8'
		)
		writeFileSync(
			join(builtinRoot, 'workspace-defaults.yaml'),
			overrides.workspaceDefaultsYaml ??
				[
					'userDefault:',
					'  skills: []'
				].join('\n'),
			'utf8'
		)
		writeFileSync(
			join(builtinRoot, 'templates', 'template-1.yaml'),
			overrides.templateYaml ?? 'source: builtin-template\n',
			'utf8'
		)
		writeFileSync(
			join(builtinRoot, 'pipelines', 'pipeline-1.yaml'),
			overrides.pipelineYaml ?? 'source: builtin-pipeline\n',
			'utf8'
		)
		writeFileSync(join(builtinRoot, 'skill-packages', '.gitkeep'), '', 'utf8')

		return builtinRoot
	}

	function writeJson(filePath: string, value: Record<string, unknown>) {
		mkdirSync(dirname(filePath), { recursive: true })
		writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8')
	}

	function readJson(filePath: string) {
		return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>
	}
})
