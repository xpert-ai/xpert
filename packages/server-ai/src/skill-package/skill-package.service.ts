import { getErrorMessage } from '@xpert-ai/server-common'
import {
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
	isWorkspacePublicSkillRepositoryProvider,
	SkillRepositoryIndexService,
	SkillRepositoryService
} from '../skill-repository'
import { FILE_SKILL_SOURCE_PROVIDER, IUploadedSkill, ZipSkillSourceProvider } from '../skill-repository/plugins/zip'
import { getMediaTypeWithCharset, listFiles } from '../shared/utils'
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
		private readonly workspaceRepository: Repository<XpertWorkspace>
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
		if (!tenantId || !organizationId) {
			throw new BadRequestException('Organization context is required to share workspace skills')
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
		const sharedRoot = getOrganizationSharedSkillsRoot(tenantId, organizationId)
		const sharedPath = getOrganizationSharedSkillPath(tenantId, organizationId, sharedSkillId)
		const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
		const sourcePath = this.resolveInstalledPath(skillPackage, installDir)
		if (!sourcePath) {
			throw new BadRequestException('Unable to locate workspace skill package path')
		}

		await fs.mkdir(sharedRoot, { recursive: true })
		await fs.rm(sharedPath, { recursive: true, force: true })
		await fs.cp(sourcePath, sharedPath, { recursive: true })

		const repository = await this.skillRepositoryService.ensureWorkspacePublicRepository()
		const metadata = this.mergeSharedMetadata(skillPackage, sharedMetadata, currentUser)
		const publisher = buildPublisherFromUser(currentUser) ?? buildPublisherFromUser({ name: metadata.author?.name })
		const publishedAt = new Date()

		await this.update(skillPackage.id, {
			metadata,
			sharedSkillId,
			sharedPackagePath: sharedSkillId,
			publishAt: publishedAt
		})

		const existingIndex = await this.findSharedSkillIndex(repository.id, sharedSkillId)
		await this.skillIndexService.create({
			id: existingIndex?.id,
			repositoryId: repository.id,
			skillId: sharedSkillId,
			skillPath: sharedSkillId,
			name: sharedMetadata.displayName,
			description: sharedMetadata.description,
			license: sharedMetadata.license,
			tags: sharedMetadata.tags,
			version: sharedMetadata.version,
			publisher,
			stats: buildSharedSkillStats(sharedMetadata.version)
		})

		return this.findOne(skillPackage.id, {
			relations: ['skillIndex', 'skillIndex.repository'],
			where: { workspaceId }
		})
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
			const strategy = this.skillSourceProviderRegistry.get(FILE_SKILL_SOURCE_PROVIDER) as ZipSkillSourceProvider
			if (!strategy?.installFromZip) {
				throw new BadRequestException('File upload strategy is not available')
			}

			const installDir = getWorkspaceSkillsRoot(tenantId, workspaceId)
			const uploadedSkills = await strategy.installFromZip(file.buffer, installDir)
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
		const fileName = basename(file.originalname || '')
		if (!fileName) {
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

	private mergeSharedMetadata(
		skillPackage: Pick<SkillPackage, 'name' | 'metadata'>,
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
		if (!tenantId || !organizationId || !sharedSkillId) {
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

	private async findWorkspacePublicRepository() {
		const { items } = await this.skillRepositoryService.findAll({
			where: {
				provider: WORKSPACE_PUBLIC_SKILL_SOURCE_PROVIDER
			} as any,
			take: 1
		})

		return items[0] ?? null
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
