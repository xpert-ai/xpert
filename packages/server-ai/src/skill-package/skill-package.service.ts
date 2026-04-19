import { getErrorMessage, normalizeUploadedFileName, yaml } from '@xpert-ai/server-common'
import {
	convertToUrlPath,
	I18nObject,
	IShareSkillPackageInput,
	ISkillRepositoryIndexPublisher,
	IUser,
	SkillMetadata,
	TFile,
	TFileDirectory,
	uuid,
	WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
} from '@xpert-ai/contracts'
import { BadRequestException, ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext, SkillSourceProviderRegistry } from '@xpert-ai/plugin-sdk'
import fs from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import { Repository } from 'typeorm'
import {
	getOrganizationSharedSkillPath,
	getOrganizationSharedSkillsRoot,
	getWorkspaceSkillsRoot,
	isWorkspacePublicSkillRepositoryProvider
} from '../skill-repository/types'
import { SkillRepositoryIndexService } from '../skill-repository/repository-index/skill-repository-index.service'
import { SkillRepositoryService } from '../skill-repository/skill-repository.service'
import {
	cleanupExtractedSkillArchive,
	extractSkillsFromZip,
	FILE_SKILL_SOURCE_PROVIDER,
	installUploadedSkills,
	IUploadedSkill,
	normalizeUploadedSkillPath
} from '../skill-repository/plugins/zip'
import { DEFAULT_ORGANIZATION_WORKSPACE_NAME } from '../initialization/constants'
import { getMediaTypeWithCharset, listFiles } from '../shared/utils'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import { XpertWorkspaceBaseService } from '../xpert-workspace'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { SkillPackage } from './skill-package.entity'

const EditableSkillExtensions = new Set([
	'md',
	'mdx',
	'txt',
	'js',
	'jsx',
	'ts',
	'tsx',
	'json',
	'yml',
	'yaml',
	'py',
	'sh',
	'html',
	'css',
	'xml',
	'env'
])

const TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE = 'bundle.yaml'
const WORKSPACE_PUBLIC_SOURCE_PACKAGE_PREFIX = 'workspace-public'
const WORKSPACE_PUBLIC_SOURCE_SKILL_PREFIX = 'workspace-public-upload'
const DEFAULT_TENANT_SKILL_WORKSPACE_NAME = 'Tenant Skills Workspace'

type SkillPackageInstallMetadata = Partial<SkillMetadata> & {
	skillMdPath?: string
	skillPath?: string
	source?: string
	resources?: IUploadedSkill['resources']
}

type SharedSkillMetadataInput = {
	displayName: string
	description: string
	tags: string[]
	license?: string
	version?: string
}

type PublishSharedSkillOptions = {
	organizationId?: string | null
	tenantId: string
	currentUser?: IUser | null
	repository: {
		id: string
	}
	sharedMetadata: SharedSkillMetadataInput
	sharedSkillId: string
}

type SharedSkillPackageSource = {
	id?: string | null
	name?: string
	metadata?: Partial<SkillMetadata> | null
}

type WorkspaceSkillFrontmatter = {
	name: string
	description: string
	version?: string
	license?: string
	tags?: string[]
}

type CreateWorkspaceSkillPackageInput = {
	userIntent: string
	skillName?: string
	skillMarkdown: string
}

type CreateWorkspaceSkillPackageResult = {
	skillPackage: SkillPackage
	packagePath: string
	skillMdPath: string
}

const buildSharedSkillStats = (version?: string | null) => ({
	comments: 0,
	downloads: 0,
	installsAllTime: 0,
	installsCurrent: 0,
	stars: 0,
	versions: version?.trim() ? 1 : 0
})

const toI18nObject = (value: string): I18nObject => ({
	en_US: value,
	zh_Hans: value
})

const readI18nText = (value?: string | I18nObject | null): string | undefined => {
	if (!value) {
		return undefined
	}

	if (typeof value === 'string') {
		const normalized = value.trim()
		return normalized || undefined
	}

	return value.en_US?.trim() || value.zh_Hans?.trim() || undefined
}

const normalizeTagList = (tags?: string[] | null) =>
	Array.from(
		new Set(
			(tags ?? [])
				.map((tag) => tag?.trim())
				.filter((tag): tag is string => !!tag)
		)
	)

const buildPublisherFromUser = (user?: IUser | null): ISkillRepositoryIndexPublisher | undefined => {
	const name = resolveUserDisplayName(user)
	if (!name) {
		return undefined
	}

	return {
		displayName: name,
		name
	}
}

function resolveUserDisplayName(user?: IUser | null) {
	const firstName = typeof user?.firstName === 'string' ? user.firstName.trim() : ''
	const lastName = typeof user?.lastName === 'string' ? user.lastName.trim() : ''
	const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
	if (fullName) {
		return fullName
	}

	if (typeof user?.name === 'string' && user.name.trim()) {
		return user.name.trim()
	}

	if (typeof user?.email === 'string' && user.email.trim()) {
		return user.email.trim()
	}

	return undefined
}

@Injectable()
export class SkillPackageService extends XpertWorkspaceBaseService<SkillPackage> {
	readonly #logger = new Logger(SkillPackageService.name)

	@Inject(SkillSourceProviderRegistry)
	private readonly skillSourceProviderRegistry: SkillSourceProviderRegistry

	constructor(
		@InjectRepository(SkillPackage)
		repository: Repository<SkillPackage>,
		private readonly skillRepositoryService: SkillRepositoryService,
		private readonly skillIndexService: SkillRepositoryIndexService,
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>,
		private readonly xpertTemplateService: XpertTemplateService
	) {
		super(repository)
	}

	async installSkillPackage(workspaceId: string, indexId: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		await this.assertWorkspaceAccess(workspaceId)
		const index = await this.skillIndexService.findOneInOrganizationOrTenant(indexId, { relations: ['repository'] })
		const strategy = this.skillSourceProviderRegistry.get(index.repository.provider)
		try {
			// Install directory
			const installDir = getWorkspaceSkillsRoot(index.repository.tenantId, workspaceId)
			const packagePath = this.normalizePackagePath(
				await strategy.installSkillPackage(index, installDir),
				installDir
			)

			// Install to database
			const skillPackage = await this.create({
				workspaceId,
				name: index.name ?? index.skillPath.split('/').pop(),
				skillIndexId: index.id,
				packagePath,
				metadata: this.buildMetadataFromIndex(index)
			})

			return skillPackage
		} catch (error) {
			this.#logger.error(`Failed to install skill package: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to install skill package: ${getErrorMessage(error)}`)
		}
	}

	async ensureInstalledSkillPackage(workspaceId: string, indexId: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		if (!indexId) {
			throw new BadRequestException('indexId is required')
		}

		await this.assertWorkspaceAccess(workspaceId)
		const existing = await this.repository.findOne({
			where: {
				workspaceId,
				skillIndexId: indexId
			},
			relations: ['skillIndex', 'skillIndex.repository']
		})
		if (existing) {
			return existing
		}

		return this.installSkillPackage(workspaceId, indexId)
	}

	async installRepositorySkillPackages(workspaceId: string, repositoryId: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		if (!repositoryId) {
			throw new BadRequestException('repositoryId is required')
		}

		await this.assertWorkspaceAccess(workspaceId)
		await this.skillRepositoryService.findOneInOrganizationOrTenant(repositoryId)

		const { items } = await this.skillIndexService.findAll({
			where: {
				repositoryId
			} as any,
			relations: ['repository'],
			order: {
				updatedAt: 'DESC'
			} as any
		} as any)

		const packages: SkillPackage[] = []
		for (const item of items ?? []) {
			if (!item?.id) {
				continue
			}

			packages.push(await this.ensureInstalledSkillPackage(workspaceId, item.id))
		}

		return packages
	}

	async uploadWorkspacePublicRepositoryPackages(repositoryId: string, file: Express.Multer.File) {
		if (!repositoryId) {
			throw new BadRequestException('repositoryId is required')
		}
		if (!file?.buffer) {
			throw new BadRequestException('A valid zip file is required')
		}

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const currentUser = RequestContext.currentUser()
		const currentUserId = RequestContext.currentUserId()
		if (!tenantId || !currentUserId) {
			throw new BadRequestException('Tenant context is required to upload repository skills')
		}

		const requestedRepository = await this.skillRepositoryService.findOneInOrganizationOrTenant(repositoryId)
		if (!isWorkspacePublicSkillRepositoryProvider(requestedRepository.provider)) {
			throw new BadRequestException('Only workspace public repositories support direct zip uploads')
		}
		const repository = await this.skillRepositoryService.ensureWorkspacePublicRepository()

		const workspace = await this.findOrCreateScopeDefaultWorkspace(tenantId, organizationId, currentUserId)
		const installDir = getWorkspaceSkillsRoot(tenantId, workspace.id)
		const { skills, tempDir } = await extractSkillsFromZip(file.buffer)

		try {
			if (!skills.length) {
				throw new BadRequestException('No skills found in the uploaded archive')
			}

			const indexes = []
			for (const skill of skills) {
				const index = await this.publishUploadedWorkspacePublicSkill({
					currentUser,
					installDir,
					organizationId,
					repositoryId: repository.id,
					skill,
					tenantId,
					workspaceId: workspace.id
				})
				indexes.push(index)
			}

			return indexes
		} catch (error) {
			this.#logger.error(`Failed to upload workspace public repository skills: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to upload skill package: ${getErrorMessage(error)}`)
		} finally {
			await cleanupExtractedSkillArchive(tempDir)
		}
	}

	async initializeWorkspacePublicRepository() {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const currentUserId = RequestContext.currentUserId()
		if (!tenantId || !currentUserId) {
			throw new BadRequestException('Tenant context is required to initialize the public skill repository')
		}

		const repository = await this.skillRepositoryService.ensureWorkspacePublicRepository()
		const workspace = await this.findOrCreateScopeDefaultWorkspace(tenantId, organizationId, currentUserId)
		const bundles = await this.xpertTemplateService.getTemplateSkillBundles()

		for (const bundle of bundles) {
			await this.ensureSharedSkillPackageFromTemplateBundle(
				workspace.id,
				{
					bundleRootPath: bundle.directoryPath,
					sharedSkillId: bundle.sharedSkillId
				},
				{
					skipAccessCheck: true
				}
			)
		}

		return repository
	}

	async createWorkspaceSkillPackage(
		workspaceId: string,
		input: CreateWorkspaceSkillPackageInput
	): Promise<CreateWorkspaceSkillPackageResult> {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		await this.assertWorkspaceAccess(workspaceId)

		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is missing')
		}

		const rawSkillMarkdown = typeof input.skillMarkdown === 'string' ? input.skillMarkdown : ''
		if (!rawSkillMarkdown.trim()) {
			throw new BadRequestException('skillMarkdown is required')
		}

		const frontmatter = parseWorkspaceSkillFrontmatter(rawSkillMarkdown)
		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const skillBaseName = input.skillName?.trim() || frontmatter.name || input.userIntent?.trim() || 'skill'
		const packagePath = await this.allocateWorkspaceSkillPackagePath(installDir, skillBaseName)
		const absolutePackagePath = join(installDir, packagePath)
		const skillMdPath = join(absolutePackagePath, 'SKILL.md')
		const normalizedSkillMarkdown = ensureTrailingNewline(rawSkillMarkdown)
		const metadata = this.buildMetadataForWorkspaceSkill(frontmatter, packagePath, skillMdPath, skillBaseName)

		await fs.mkdir(absolutePackagePath, { recursive: true })
		await fs.writeFile(skillMdPath, normalizedSkillMarkdown, 'utf8')

		try {
			const skillPackage = await this.create({
				workspaceId,
				name: metadata.name ?? skillBaseName,
				skillIndexId: null,
				visibility: 'private',
				packagePath,
				metadata
			})

			return {
				skillPackage,
				packagePath,
				skillMdPath
			}
		} catch (error) {
			await fs.rm(absolutePackagePath, { recursive: true, force: true })
			throw error
		}
	}

	async uninstallSkillPackage(id: string) {
		const skillPackage = await this.findOne(id, { relations: ['skillIndex', 'skillIndex.repository'] })
		return this.uninstallResolvedSkillPackage(skillPackage)
	}

	async uninstallSkillPackageInWorkspace(workspaceId: string, id: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		await this.assertWorkspaceAccess(workspaceId)
		const skillPackage = await this.findOne(id, {
			where: { workspaceId },
			relations: ['skillIndex', 'skillIndex.repository']
		})
		return this.uninstallResolvedSkillPackage(skillPackage, workspaceId)
	}

	async shareSkillPackage(workspaceId: string, id: string, input: IShareSkillPackageInput) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const currentUser = RequestContext.currentUser()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required to share workspace skills')
		}

		await this.assertWorkspaceAccess(workspaceId)
		const skillPackage = await this.findOne(id, {
			where: { workspaceId },
			relations: ['skillIndex', 'skillIndex.repository']
		})
		if (skillPackage.skillIndexId) {
			throw new BadRequestException('Only workspace uploaded skills can be shared')
		}

		const sharedMetadata = this.normalizeSharedSkillInput(skillPackage, input)
		const sharedSkillId = skillPackage.sharedSkillId ?? `shared-skill-${uuid()}`
		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const sourcePath = this.resolveInstalledPath(skillPackage, installDir)
		if (!sourcePath) {
			throw new BadRequestException('Unable to locate workspace skill package path')
		}

		const repository = await this.skillRepositoryService.ensureWorkspacePublicRepository()
		const metadata = this.mergeSharedMetadata(skillPackage, sharedMetadata, currentUser)
		await this.publishSharedSkillPackage(skillPackage, sourcePath, metadata, {
			tenantId,
			organizationId,
			currentUser,
			repository: {
				id: repository.id
			},
			sharedMetadata,
			sharedSkillId
		})

		return this.findOne(skillPackage.id, {
			relations: ['skillIndex', 'skillIndex.repository'],
			where: { workspaceId }
		})
	}

	async ensureSharedSkillPackageFromTemplateBundle(
		workspaceId: string,
		input: {
			bundleRootPath: string
			sharedSkillId: string
		},
		options?: {
			skipAccessCheck?: boolean
		}
	) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		if (!input.bundleRootPath?.trim()) {
			throw new BadRequestException('bundleRootPath is required')
		}
		if (!input.sharedSkillId?.trim()) {
			throw new BadRequestException('sharedSkillId is required')
		}

		if (!options?.skipAccessCheck) {
			await this.assertWorkspaceAccess(workspaceId)
		}

		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const currentUser = RequestContext.currentUser()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required to publish template skill bundles')
		}

		const repository = await this.skillRepositoryService.ensureWorkspacePublicRepository()
		const existingIndex = await this.findSharedSkillIndex(repository.id, input.sharedSkillId)
		if (existingIndex) {
			return existingIndex
		}

		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const bundleRootPath = input.bundleRootPath.trim()
		const skillMdPath = join(bundleRootPath, 'SKILL.md')
		const skillMarkdown = await fs.readFile(skillMdPath, 'utf8').catch((error) => {
			throw new BadRequestException(`Template skill bundle is missing SKILL.md: ${getErrorMessage(error)}`)
		})
		const frontmatter = parseWorkspaceSkillFrontmatter(skillMarkdown)
		const skillBaseName = frontmatter.name?.trim() || basename(bundleRootPath)
		const packagePath = await this.allocateWorkspaceSkillPackagePath(installDir, skillBaseName)
		const absolutePackagePath = join(installDir, packagePath)
		await fs.mkdir(installDir, { recursive: true })
		await fs.cp(bundleRootPath, absolutePackagePath, {
			recursive: true,
			filter: (source) => {
				const normalizedSource = resolve(source)
				return normalizedSource !== resolve(join(bundleRootPath, TEMPLATE_SKILL_BUNDLE_MANIFEST_FILE))
			}
		})

		const skillPackage = await this.create({
			workspaceId,
			name: frontmatter.name?.trim() || skillBaseName,
			packagePath,
			metadata: this.buildMetadataForWorkspaceSkill(
				frontmatter,
				packagePath,
				join(absolutePackagePath, 'SKILL.md'),
				skillBaseName
			)
		})

		try {
			const sharedMetadata = this.normalizeTemplateSharedSkillInputFromFrontmatter(frontmatter, skillBaseName)
			const metadata = this.mergeSharedMetadata(skillPackage, sharedMetadata, currentUser)
			const sourcePath = absolutePackagePath

			await this.publishSharedSkillPackage(skillPackage, sourcePath, metadata, {
				tenantId,
				organizationId,
				currentUser,
				repository: {
					id: repository.id
				},
				sharedMetadata,
				sharedSkillId: input.sharedSkillId.trim()
			})

			return this.findSharedSkillIndex(repository.id, input.sharedSkillId.trim())
		} catch (error) {
			await fs.rm(absolutePackagePath, { recursive: true, force: true })
			await this.repository.softDelete(skillPackage.id)
			throw error
		}
	}

	private async uninstallResolvedSkillPackage(skillPackage: SkillPackage, expectedWorkspaceId?: string) {
		const metadata = this.getInstallMetadata(skillPackage)
		const provider =
			skillPackage.skillIndex?.repository?.provider ?? metadata?.source ?? undefined

		const tenantId = skillPackage.tenantId
		const workspaceId = skillPackage.workspaceId
		if (!tenantId || !workspaceId) {
			throw new BadRequestException('Missing tenant or workspace context for uninstall')
		}
		if (expectedWorkspaceId && expectedWorkspaceId !== workspaceId) {
			throw new BadRequestException('Skill does not belong to the specified workspace')
		}
		await this.assertWorkspaceAccess(workspaceId)

		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const installPath = this.resolveInstalledPath(skillPackage, installDir)
		// if (!installPath) {
		// 	throw new BadRequestException('Unable to locate installed skill path')
		// }

		try {
			if (provider && installPath) {
				const strategy = this.skillSourceProviderRegistry.get(provider)
				await strategy.uninstallSkillPackage(installPath)
			}
			await this.cleanupSharedSkillPublication(skillPackage)
			await this.repository.softDelete(skillPackage.id)
			return { id: skillPackage.id, uninstalled: true }
		} catch (error) {
			this.#logger.error(`Failed to uninstall skill package: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to uninstall skill package: ${getErrorMessage(error)}`)
		}
	}

	/**
	 * Upload and install skills from a zip archive directly into a workspace.
	 */
	async uploadSkillPackagesFromFile(workspaceId: string, file: Express.Multer.File) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		if (!file?.buffer) {
			throw new BadRequestException('A valid zip file is required')
		}
		await this.assertWorkspaceAccess(workspaceId)

		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is missing')
		}

		try {
			const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
			const { skills, tempDir } = await extractSkillsFromZip(file.buffer)
			try {
				const uploadedSkills = await installUploadedSkills(skills, installDir)
				if (!uploadedSkills.length) {
					throw new BadRequestException('No skills found in the uploaded archive')
				}
				const packages: SkillPackage[] = []

				for (const skill of uploadedSkills) {
					const packagePath = this.resolveUploadPackagePath(skill, installDir)
					packages.push(
						await this.create({
							workspaceId,
							name: skill.name,
							packagePath,
							metadata: this.buildMetadataForUpload(skill)
						})
					)
				}

				return packages
			} finally {
				await cleanupExtractedSkillArchive(tempDir)
			}
		} catch (error) {
			this.#logger.error(`Failed to upload skill package: ${getErrorMessage(error)}`)
			throw new BadRequestException(`Failed to upload skill package: ${getErrorMessage(error)}`)
		}
	}

	async getSkillPackageFiles(workspaceId: string, id: string, filePath?: string, deepth?: number): Promise<TFileDirectory[]> {
		const { rootPath } = await this.resolveSkillPackageRoot(workspaceId, id)
		const normalizedPath = validateSkillRelativePath(rootPath, filePath)
		const directoryTree = await listFiles(normalizedPath, normalizeDepth(deepth), 0, {
			root: rootPath,
			baseUrl: ''
		})

		return directoryTree ?? []
	}

	async readSkillPackageFile(workspaceId: string, id: string, filePath: string): Promise<TFile> {
		const { absolutePath, relativePath } = await this.resolveSkillPackageFilePath(workspaceId, id, filePath)
		const stat = await fs.stat(absolutePath).catch(() => null)
		if (!stat?.isFile()) {
			throw new BadRequestException('Skill file not found')
		}

		const buffer = await fs.readFile(absolutePath)
		const contents = isBinaryBuffer(buffer) ? undefined : buffer.toString('utf8')

		return {
			filePath: relativePath,
			fileType: getSkillFileExtension(relativePath) || 'text',
			mimeType: getMediaTypeWithCharset(relativePath),
			contents,
			size: stat.size,
			createdAt: stat.mtime
		}
	}

	async uploadSkillPackageFile(
		workspaceId: string,
		id: string,
		folderPath: string,
		file: { originalname: string; buffer: Buffer; mimetype?: string }
	): Promise<TFile> {
		const { rootPath } = await this.resolveSkillPackageRoot(workspaceId, id)
		const relativeFolderPath = validateSkillRelativePath(rootPath, folderPath)
		let fileName = ''
		try {
			fileName = normalizeUploadedFileName(file.originalname)
		} catch {
			throw new BadRequestException('File name is required')
		}

		const relativeFilePath = [relativeFolderPath, fileName].filter(Boolean).join('/')
		const absolutePath = resolve(rootPath, relativeFilePath)
		const resolvedRelativePath = relative(rootPath, absolutePath)
		if (resolvedRelativePath.startsWith('..') || isAbsolute(resolvedRelativePath)) {
			throw new BadRequestException('Invalid skill file path')
		}

		await fs.mkdir(dirname(absolutePath), { recursive: true })
		await fs.writeFile(absolutePath, file.buffer)
		return this.readSkillPackageFile(workspaceId, id, resolvedRelativePath.replace(/\\/g, '/'))
	}

	async saveSkillPackageFile(workspaceId: string, id: string, filePath: string, content: string): Promise<TFile> {
		const normalizedPath = normalizeSkillFilePath(filePath)
		if (!normalizedPath) {
			throw new BadRequestException('File path is required')
		}
		if (!isEditableSkillFile(normalizedPath)) {
			throw new BadRequestException('This file type cannot be edited')
		}

		const { absolutePath } = await this.resolveSkillPackageFilePath(workspaceId, id, normalizedPath)
		const stat = await fs.stat(absolutePath).catch(() => null)
		if (!stat?.isFile()) {
			throw new BadRequestException('Skill file not found')
		}

		await fs.writeFile(absolutePath, content ?? '', 'utf8')
		return this.readSkillPackageFile(workspaceId, id, normalizedPath)
	}

	async deleteSkillPackageFile(workspaceId: string, id: string, filePath: string): Promise<void> {
		const { absolutePath } = await this.resolveSkillPackageFilePath(workspaceId, id, filePath)
		const stat = await fs.stat(absolutePath).catch(() => null)
		if (!stat?.isFile()) {
			throw new BadRequestException('Skill file not found')
		}

		await fs.unlink(absolutePath)
	}

	async getSkillPackageFileDownload(workspaceId: string, id: string, filePath: string) {
		const { absolutePath, relativePath } = await this.resolveSkillPackageFilePath(workspaceId, id, filePath)
		const stat = await fs.stat(absolutePath).catch(() => null)
		if (!stat?.isFile()) {
			throw new BadRequestException('Skill file not found')
		}

		return {
			absolutePath,
			fileName: basename(relativePath),
			mimeType: getMediaTypeWithCharset(relativePath)
		}
	}

	private buildMetadataForUpload(skill: IUploadedSkill): SkillPackageInstallMetadata {
		const normalizedSkillPath = this.normalizeRelativePackagePath(skill.skillPath ?? '')
		return {
			name: skill.name,
			description: {
				en_US: skill.description ?? ''
			},
			tags: skill.tags ?? [],
			license: skill.license,
			version: skill.version,
			skillPath: normalizedSkillPath ?? skill.skillPath,
			source: FILE_SKILL_SOURCE_PROVIDER,
			skillMdPath: skill.absolutePath,
			resources: skill.resources
		}
	}

	private buildSharedMetadataFromUpload(skill: IUploadedSkill): SharedSkillMetadataInput {
		const displayName = skill.name?.trim() || normalizeUploadedSkillPath(skill.skillPath || 'skill')

		return {
			displayName,
			description: skill.description?.trim() || '',
			tags: normalizeTagList(skill.tags),
			license: skill.license?.trim() || undefined,
			version: skill.version?.trim() || undefined
		}
	}

	private buildMetadataForWorkspaceSkill(
		frontmatter: WorkspaceSkillFrontmatter,
		packagePath: string,
		skillMdPath: string,
		skillName: string
	): SkillPackageInstallMetadata {
		const displayName = frontmatter.name?.trim() || skillName.trim()
		const description = frontmatter.description?.trim()

		return {
			name: displayName || packagePath,
			displayName: displayName ? toI18nObject(displayName) : undefined,
			description: description ? toI18nObject(description) : undefined,
			tags: normalizeTagList(frontmatter.tags),
			license: frontmatter.license?.trim() || undefined,
			version: frontmatter.version?.trim() || undefined,
			visibility: 'private',
			skillPath: packagePath,
			source: FILE_SKILL_SOURCE_PROVIDER,
			skillMdPath
		}
	}

	private buildMetadataFromIndex(index: {
		name?: string
		description?: string
		tags?: string[]
		license?: string
		version?: string
		publisher?: ISkillRepositoryIndexPublisher
	}) {
		const displayName = index.name?.trim()
		const description = index.description?.trim()
		const publisherName =
			index.publisher?.displayName?.trim() ||
			index.publisher?.name?.trim() ||
			index.publisher?.handle?.trim()

		return {
			displayName: displayName ? toI18nObject(displayName) : undefined,
			description: description ? toI18nObject(description) : undefined,
			tags: normalizeTagList(index.tags),
			license: index.license?.trim() || undefined,
			version: index.version?.trim() || undefined,
			author: publisherName
				? {
					name: publisherName
				}
				: undefined
		} satisfies Partial<SkillMetadata>
	}

	private buildWorkspacePublicSourceIdentifiers(skill: IUploadedSkill) {
		const normalizedSkillPath = normalizeUploadedSkillPath(skill.skillPath || skill.name || 'skill')
		const sharedSkillId = `${WORKSPACE_PUBLIC_SOURCE_SKILL_PREFIX}__${encodeURIComponent(normalizedSkillPath || 'skill')}`

		return {
			normalizedSkillPath,
			packagePath: `${WORKSPACE_PUBLIC_SOURCE_PACKAGE_PREFIX}/${sharedSkillId}`,
			sharedSkillId
		}
	}

	private async allocateWorkspaceSkillPackagePath(installDir: string, skillName: string) {
		const baseSlug = toWorkspaceSkillSlug(skillName)

		for (let index = 1; index < 100; index++) {
			const candidate = index === 1 ? baseSlug : `${baseSlug}-${index}`
			const absoluteCandidate = join(installDir, candidate)
			if (!(await pathExists(absoluteCandidate))) {
				return candidate
			}
		}

		return `${baseSlug}-${Date.now()}`
	}

	private normalizeSharedSkillInput(skillPackage: SkillPackage, input: IShareSkillPackageInput): SharedSkillMetadataInput {
		const fallbackDisplayName =
			readI18nText(skillPackage.metadata?.displayName) ||
			skillPackage.name ||
			skillPackage.metadata?.name ||
			''
		const fallbackDescription = readI18nText(skillPackage.metadata?.description) || ''
		const displayName = (input.displayName || fallbackDisplayName).trim()
		const description = (input.description || fallbackDescription).trim()
		if (!displayName) {
			throw new BadRequestException('displayName is required')
		}
		if (!description) {
			throw new BadRequestException('description is required')
		}

		return {
			displayName,
			description,
			tags: normalizeTagList(input.tags ?? skillPackage.metadata?.tags),
			license: input.license?.trim() || skillPackage.metadata?.license?.trim() || undefined,
			version: input.version?.trim() || skillPackage.metadata?.version?.trim() || undefined
		}
	}

	private normalizeTemplateSharedSkillInputFromFrontmatter(
		frontmatter: WorkspaceSkillFrontmatter,
		fallbackName: string
	): SharedSkillMetadataInput {
		const displayName = frontmatter.name?.trim() || fallbackName.trim()
		if (!displayName) {
			throw new BadRequestException('Template skill bundle is missing a skill name')
		}

		const description = frontmatter.description?.trim()
		if (!description) {
			throw new BadRequestException('Template skill bundle is missing a skill description')
		}

		return {
			displayName,
			description,
			tags: normalizeTagList(frontmatter.tags),
			license: frontmatter.license?.trim() || undefined,
			version: frontmatter.version?.trim() || undefined
		}
	}

	private mergeSharedMetadata(
		skillPackage: SharedSkillPackageSource,
		input: SharedSkillMetadataInput,
		currentUser?: IUser | null
	): SkillMetadata {
		const metadata = skillPackage.metadata
		const authorName = resolveUserDisplayName(currentUser) || metadata?.author?.name || 'Workspace Creator'
		return {
			...(metadata ?? {
				name: skillPackage.name || input.displayName,
				visibility: 'private'
			}),
			name: metadata?.name || skillPackage.name || input.displayName,
			displayName: toI18nObject(input.displayName),
			description: toI18nObject(input.description),
			tags: input.tags,
			license: input.license,
			version: input.version,
			author: {
				...(metadata?.author ?? {}),
				name: authorName
			},
			visibility: metadata?.visibility ?? 'private'
		}
	}

	private async findSharedSkillIndex(repositoryId: string, sharedSkillId: string) {
		const { items } = await this.skillIndexService.findAll({
			where: {
				repositoryId,
				skillId: sharedSkillId
			} as any,
			take: 1
		})

		return items[0] ?? null
	}

	private async cleanupSharedSkillPublication(skillPackage: SkillPackage) {
		if (skillPackage.skillIndexId) {
			return
		}

		const tenantId = skillPackage.tenantId
		const organizationId = skillPackage.organizationId
		const sharedSkillId = skillPackage.sharedSkillId
		if (!tenantId || !sharedSkillId) {
			return
		}

		const provider = skillPackage.skillIndex?.repository?.provider
		if (provider && !isWorkspacePublicSkillRepositoryProvider(provider)) {
			return
		}

		const sharedPath = getOrganizationSharedSkillPath(tenantId, organizationId, sharedSkillId)
		await fs.rm(sharedPath, { recursive: true, force: true })

		const repository = await this.findWorkspacePublicRepository()
		if (!repository?.id) {
			return
		}

		const existingIndex = await this.findSharedSkillIndex(repository.id, sharedSkillId)
		if (existingIndex?.id) {
			await this.skillIndexService.softDelete(existingIndex.id)
		}
	}

	private async publishSharedSkillPackage(
		skillPackage: SharedSkillPackageSource,
		sourcePath: string,
		metadata: SkillMetadata,
		options: PublishSharedSkillOptions
	) {
		if (!skillPackage.id) {
			throw new BadRequestException('Missing skill package id for shared publication')
		}

		const sharedRoot = getOrganizationSharedSkillsRoot(options.tenantId, options.organizationId)
		const sharedPath = getOrganizationSharedSkillPath(options.tenantId, options.organizationId, options.sharedSkillId)
		const publisher =
			buildPublisherFromUser(options.currentUser) ?? buildPublisherFromUser({ name: metadata.author?.name })
		const publishedAt = new Date()

		await fs.mkdir(dirname(sharedPath), { recursive: true })
		await fs.mkdir(sharedRoot, { recursive: true })
		await fs.rm(sharedPath, { recursive: true, force: true })
		await fs.cp(sourcePath, sharedPath, { recursive: true })

		await this.update(skillPackage.id, {
			metadata,
			sharedSkillId: options.sharedSkillId,
			sharedPackagePath: options.sharedSkillId,
			publishAt: publishedAt
		})

		const existingIndex = await this.findSharedSkillIndex(options.repository.id, options.sharedSkillId)
		return this.skillIndexService.create({
			id: existingIndex?.id,
			repositoryId: options.repository.id,
			skillId: options.sharedSkillId,
			skillPath: options.sharedSkillId,
			name: options.sharedMetadata.displayName,
			description: options.sharedMetadata.description,
			license: options.sharedMetadata.license,
			tags: options.sharedMetadata.tags,
			version: options.sharedMetadata.version,
			publisher,
			stats: buildSharedSkillStats(options.sharedMetadata.version)
		})
	}

	private async publishUploadedWorkspacePublicSkill(input: {
		currentUser?: IUser | null
		installDir: string
		organizationId?: string | null
		repositoryId: string
		skill: IUploadedSkill
		tenantId: string
		workspaceId: string
	}) {
		const identifiers = this.buildWorkspacePublicSourceIdentifiers(input.skill)
		const sourcePath = join(input.installDir, identifiers.packagePath)
		const existingSkillPackage = await this.repository.findOne({
			where: {
				workspaceId: input.workspaceId,
				sharedSkillId: identifiers.sharedSkillId
			}
		})

		if (existingSkillPackage?.packagePath && existingSkillPackage.packagePath !== identifiers.packagePath) {
			await fs.rm(join(input.installDir, existingSkillPackage.packagePath), {
				recursive: true,
				force: true
			})
		}

		await fs.mkdir(dirname(sourcePath), { recursive: true })
		await fs.rm(sourcePath, { recursive: true, force: true })
		await fs.cp(input.skill.absolutePath, sourcePath, { recursive: true })

		const metadata = this.buildMetadataForUpload({
			...input.skill,
			absolutePath: join(sourcePath, 'SKILL.md'),
			skillPath: identifiers.packagePath
		})

		let skillPackage: {
			id: string
			name?: string
			metadata?: Partial<SkillMetadata> | null
		}
		if (existingSkillPackage) {
			await this.repository.save({
				...existingSkillPackage,
				name: input.skill.name,
				packagePath: identifiers.packagePath,
				sharedSkillId: identifiers.sharedSkillId,
				sharedPackagePath: identifiers.sharedSkillId,
				visibility: 'private',
				metadata
			})
			skillPackage = {
				id: existingSkillPackage.id,
				name: input.skill.name,
				metadata
			}
		} else {
			const createdSkillPackage = await this.create({
				workspaceId: input.workspaceId,
				name: input.skill.name,
				packagePath: identifiers.packagePath,
				sharedSkillId: identifiers.sharedSkillId,
				sharedPackagePath: identifiers.sharedSkillId,
				visibility: 'private',
				metadata
			})
			skillPackage = {
				id: createdSkillPackage.id,
				name: createdSkillPackage.name,
				metadata: createdSkillPackage.metadata
			}
		}

		const sharedMetadata = this.buildSharedMetadataFromUpload(input.skill)
		const mergedMetadata = this.mergeSharedMetadata(skillPackage, sharedMetadata, input.currentUser)

		return this.publishSharedSkillPackage(skillPackage, sourcePath, mergedMetadata, {
			currentUser: input.currentUser,
			organizationId: input.organizationId,
			repository: {
				id: input.repositoryId
			},
			sharedMetadata,
			sharedSkillId: identifiers.sharedSkillId,
			tenantId: input.tenantId
		})
	}

	private async findWorkspacePublicRepository() {
		const { items } = await this.skillRepositoryService.findAll({
			where: {
				provider: WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
			} as any,
			take: 1
		})

		return items[0] ?? null
	}

	private async findOrCreateScopeDefaultWorkspace(tenantId: string, organizationId: string | null | undefined, ownerId: string) {
		const workspaceKind = organizationId ? 'org-default' : 'tenant-default'
		const workspaceName = organizationId ? DEFAULT_ORGANIZATION_WORKSPACE_NAME : DEFAULT_TENANT_SKILL_WORKSPACE_NAME
		const query = this.workspaceRepository
			.createQueryBuilder('workspace')
			.where('workspace.tenantId = :tenantId', { tenantId })
			.andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'kind', '') = :kind`, {
				kind: workspaceKind
			})

		if (organizationId) {
			query.andWhere('workspace.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('workspace.organizationId IS NULL')
		}

		let workspace = await query.getOne()

		if (!workspace) {
			workspace = this.workspaceRepository.create({
				name: workspaceName,
				tenantId,
				organizationId,
				ownerId,
				status: 'active',
				settings: {
					system: {
						kind: workspaceKind
					}
				}
			})
			workspace = await this.workspaceRepository.save(workspace)
		}

		if (!workspace.ownerId) {
			await this.workspaceRepository.update(workspace.id, { ownerId })
			workspace =
				(await this.workspaceRepository.findOne({
					where: {
						id: workspace.id
					}
				})) ?? workspace
		}

		return workspace
	}

	private resolveInstalledPath(skillPackage: SkillPackage, installDir: string) {
		if (skillPackage.packagePath) {
			const packageAbsPath = join(installDir, skillPackage.packagePath)
			const safePath = this.ensureWithinInstall(packageAbsPath, installDir)
			if (safePath) {
				return safePath
			}
		}

		const skillMdPath = this.getInstallMetadata(skillPackage)?.skillMdPath
		if (skillMdPath) {
			const safePath = this.ensureWithinInstall(dirname(skillMdPath), installDir)
			if (safePath) {
				return safePath
			}
		}

		return null
		// throw new BadRequestException('Unable to resolve installed skill package path')
	}

	private resolveUploadPackagePath(skill: IUploadedSkill, installDir: string) {
		if (!skill?.absolutePath) {
			return null
		}
		const packageAbsPath = dirname(skill.absolutePath)
		const safePath = this.ensureWithinInstall(packageAbsPath, installDir)
		return safePath ? this.normalizeRelativePackagePath(relative(installDir, safePath)) : null
	}

	private ensureWithinInstall(targetPath: string, installDir: string) {
		const root = resolve(installDir)
		const resolvedPath = resolve(targetPath)
		const relativePath = relative(root, resolvedPath)
		if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
			return null
		}
		return resolvedPath
	}

	private normalizePackagePath(packagePath: string, installDir: string) {
		if (!packagePath) {
			return null
		}
		const absPath = isAbsolute(packagePath) ? packagePath : join(installDir, packagePath)
		const safePath = this.ensureWithinInstall(absPath, installDir)
		return safePath ? this.normalizeRelativePackagePath(relative(installDir, safePath)) : null
	}

	private normalizeRelativePackagePath(packagePath: string) {
		const unixPath = packagePath
			.replace(/\\/g, '/')
			.replace(/^\/+/, '')
			.replace(/^\.\/+/, '')
		const normalized = unixPath.replace(/^(skills\/)+/, '')
		return normalized || null
	}

	private getInstallMetadata(skillPackage: SkillPackage): SkillPackageInstallMetadata | null {
		return skillPackage.metadata as SkillPackageInstallMetadata | null
	}

	private async resolveSkillPackageRoot(workspaceId: string, id: string) {
		if (!workspaceId) {
			throw new BadRequestException('workspaceId is required')
		}
		await this.assertWorkspaceAccess(workspaceId)

		const skillPackage = await this.findOne(id, {
			where: { workspaceId },
			relations: ['skillIndex', 'skillIndex.repository']
		})
		const tenantId = skillPackage?.tenantId
		if (!tenantId) {
			throw new BadRequestException('Missing tenant context for skill package')
		}

		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const rootPath = this.resolveInstalledPath(skillPackage, installDir)
		if (!rootPath) {
			throw new BadRequestException('Unable to locate installed skill package path')
		}

		return {
			skillPackage,
			rootPath
		}
	}

	private async resolveSkillPackageFilePath(workspaceId: string, id: string, filePath: string) {
		const { rootPath } = await this.resolveSkillPackageRoot(workspaceId, id)
		const relativePath = validateSkillRelativePath(rootPath, filePath)
		if (!relativePath) {
			throw new BadRequestException('File path is required')
		}

		const absolutePath = resolve(rootPath, relativePath)
		const resolvedRelativePath = relative(rootPath, absolutePath)
		if (resolvedRelativePath.startsWith('..') || isAbsolute(resolvedRelativePath)) {
			throw new BadRequestException('Invalid skill file path')
		}

		return {
			rootPath,
			absolutePath,
			relativePath: resolvedRelativePath.replace(/\\/g, '/')
		}
	}

	private async assertWorkspaceAccess(workspaceId: string) {
		const tenantId = RequestContext.currentTenantId()
		const organizationId = RequestContext.getOrganizationId()
		const userId = RequestContext.currentUserId()
		if (!tenantId || !userId) {
			throw new ForbiddenException('Missing tenant or user context')
		}

		const query = this.workspaceRepository
			.createQueryBuilder('workspace')
			.leftJoin('workspace.members', 'member')
			.where('workspace.id = :workspaceId', { workspaceId })
			.andWhere('workspace.tenantId = :tenantId', { tenantId })
			.andWhere('(workspace.ownerId = :userId OR member.id = :userId)', { userId })

		if (organizationId) {
			query.andWhere('workspace.organizationId = :organizationId', { organizationId })
		} else {
			query.andWhere('workspace.organizationId IS NULL')
		}

		const workspace = await query.getOne()
		if (!workspace) {
			throw new ForbiddenException('Access denied to workspace')
		}
	}
}

function parseWorkspaceSkillFrontmatter(skillMarkdown: string): WorkspaceSkillFrontmatter {
	const frontmatterMatch = /^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/.exec(skillMarkdown)
	if (!frontmatterMatch) {
		throw new BadRequestException('SKILL.md frontmatter is required')
	}

	let parsedFrontmatter: unknown
	try {
		parsedFrontmatter = yaml.parse(frontmatterMatch[1])
	} catch {
		throw new BadRequestException('SKILL.md frontmatter is invalid')
	}

	if (!parsedFrontmatter || typeof parsedFrontmatter !== 'object' || Array.isArray(parsedFrontmatter)) {
		throw new BadRequestException('SKILL.md frontmatter is invalid')
	}

	const candidate = parsedFrontmatter as {
		name?: unknown
		description?: unknown
		version?: unknown
		license?: unknown
		tags?: unknown
	}
	const name = typeof candidate.name === 'string' ? candidate.name.trim() : ''
	const description = typeof candidate.description === 'string' ? candidate.description.trim() : ''
	if (!name || !description) {
		throw new BadRequestException('SKILL.md frontmatter must include name and description')
	}

	return {
		name,
		description,
		version: typeof candidate.version === 'string' && candidate.version.trim() ? candidate.version.trim() : undefined,
		license: typeof candidate.license === 'string' && candidate.license.trim() ? candidate.license.trim() : undefined,
		tags: Array.isArray(candidate.tags)
			? candidate.tags
					.map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
					.filter((tag): tag is string => Boolean(tag))
			: undefined
	}
}

async function pathExists(path: string) {
	try {
		await fs.access(path)
		return true
	} catch {
		return false
	}
}

function ensureTrailingNewline(value: string) {
	return value.endsWith('\n') ? value : `${value}\n`
}

function toWorkspaceSkillSlug(value: string) {
	const normalized = convertToUrlPath(value).replace(/^\/+|\/+$/g, '')
	const flattened = normalized
		.split('/')
		.map((segment) => segment.trim())
		.filter(Boolean)
		.join('-')
	return flattened || 'skill'
}

function normalizeSkillFilePath(filePath?: string | null) {
	return (filePath ?? '')
		.replace(/\\/g, '/')
		.replace(/^\/+/, '')
		.replace(/^\.\//, '')
}

function normalizeDepth(deepth?: number | string) {
	const value = typeof deepth === 'string' ? Number(deepth) : deepth
	return typeof value === 'number' && Number.isFinite(value) ? value : 1
}

function isEditableSkillFile(filePath: string) {
	const normalized = normalizeSkillFilePath(filePath)
	const extension = getSkillFileExtension(normalized)
	return EditableSkillExtensions.has(extension)
}

function isBinaryBuffer(buffer: Buffer) {
	const sample = buffer.subarray(0, Math.min(buffer.length, 8000))
	for (const value of sample) {
		if (value === 0) {
			return true
		}
	}
	return false
}

function validateSkillRelativePath(rootPath: string, filePath?: string | null) {
	const normalized = normalizeSkillFilePath(filePath)
	if (!normalized) {
		return ''
	}

	const absolutePath = resolve(rootPath, normalized)
	const resolvedRelativePath = relative(rootPath, absolutePath)
	if (resolvedRelativePath.startsWith('..') || isAbsolute(resolvedRelativePath)) {
		throw new BadRequestException('Invalid skill file path')
	}

	return resolvedRelativePath.replace(/\\/g, '/')
}

function getSkillFileExtension(filePath: string) {
	const fileName = basename(filePath).toLowerCase()
	if (fileName.startsWith('.') && fileName.indexOf('.', 1) === -1) {
		return fileName.slice(1)
	}

	const parts = fileName.split('.')
	return parts.length > 1 ? parts.pop() ?? '' : ''
}
