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

		async findOne() {
			return null
		}
	}
}))

jest.mock('../xpert-workspace/workspace.entity', () => ({
	XpertWorkspace: class XpertWorkspace {}
}))

import { getWorkspaceSkillsRoot } from '../skill-repository'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
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
	let tempRoot: string | null

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
		tempRoot = null

		jest.spyOn(service as any, 'assertWorkspaceAccess').mockResolvedValue(undefined)
		createSpy = jest.spyOn(service, 'create').mockImplementation(async (item: any) => item)
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
				id: 'index-2',
				version: undefined
			}),
			'/tmp/workspace-skills'
		)
		expect(createArg.metadata.version).toBeUndefined()
		expect(result.metadata.version).toBeUndefined()
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
})
