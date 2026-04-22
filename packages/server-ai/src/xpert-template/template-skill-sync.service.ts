import {
	ITemplateSkillSyncBundleResult,
	ITemplateSkillSyncIndexResult,
	ITemplateSkillSyncItemSummary,
	ITemplateSkillSyncRefResult,
	ITemplateSkillSyncRepositoryResult,
	ITemplateSkillSyncResult,
	IUser,
	LanguagesEnum,
	RolesEnum,
	TemplateSkillSyncMode,
	TemplateSkillSyncStatus
} from '@xpert-ai/contracts'
import {
	RequestContext,
	runWithRequestContext
} from '@xpert-ai/plugin-sdk'
import {
	CACHE_MANAGER
} from '@nestjs/cache-manager'
import {
	BadRequestException,
	ConflictException,
	forwardRef,
	Inject,
	Injectable,
	Logger
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Cache } from 'cache-manager'
import {
	runWithRequestContext as runWithLegacyRequestContext,
	UserService
} from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { SkillPackageService } from '../skill-package/skill-package.service'
import { SkillRepository } from '../skill-repository/skill-repository.entity'
import { SkillRepositoryIndexService } from '../skill-repository/repository-index/skill-repository-index.service'
import { SkillRepositoryService } from '../skill-repository/skill-repository.service'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import {
	TDefaultSkillRepositoryEntry,
	TWorkspaceDefaultSkillRef,
	XpertTemplateService
} from './xpert-template.service'

type TemplateSkillSyncInput = {
	mode?: TemplateSkillSyncMode
	validateOnly?: boolean
}

type CurrentTenantTemplateSkillSyncInput = TemplateSkillSyncInput & {
	skipLock?: boolean
	updateFingerprint?: boolean
}

type TenantLockBehavior = 'throw' | 'skip'

type DistinctTenantRow = {
	tenantId: string | null
}

const TEMPLATE_SKILL_SYNC_LOCK_NAME = 'template-skill-sync'
const TEMPLATE_SKILL_SYNC_FINGERPRINT_PREFIX = 'xpert:template-skill-sync:fingerprint:'

const isObjectValue = (value: unknown): value is object =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const EMPTY_ITEM_SUMMARY: ITemplateSkillSyncItemSummary = {
	created: 0,
	updated: 0,
	unchanged: 0,
	missing: 0,
	failed: 0
}

@Injectable()
export class TemplateSkillSyncService {
	readonly #logger = new Logger(TemplateSkillSyncService.name)

	constructor(
		private readonly xpertTemplateService: XpertTemplateService,
		private readonly skillRepositoryService: SkillRepositoryService,
		private readonly skillRepositoryIndexService: SkillRepositoryIndexService,
		@Inject(forwardRef(() => SkillPackageService))
		private readonly skillPackageService: SkillPackageService,
		private readonly userService: UserService,
		@InjectRepository(SkillRepository)
		private readonly skillRepositoryRepository: Repository<SkillRepository>,
		@InjectRepository(XpertWorkspace)
		private readonly workspaceRepository: Repository<XpertWorkspace>,
		@Inject(CACHE_MANAGER)
		private readonly cacheManager: Cache
	) {}

	async syncSkillAssets(input: TemplateSkillSyncInput = {}) {
		const tenantId = RequestContext.currentTenantId()
		const currentUser = RequestContext.currentUser()
		if (!tenantId || !currentUser?.id) {
			throw new BadRequestException('Tenant context is required to sync template skill assets')
		}

		return this.runInTenantContext(currentUser, () =>
			this.syncCurrentTenantSkillAssets({
				mode: input.mode ?? 'incremental',
				validateOnly: input.validateOnly ?? false
			})
		)
	}

	async syncCurrentTenantSkillAssets(input: CurrentTenantTemplateSkillSyncInput = {}): Promise<ITemplateSkillSyncResult> {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			throw new BadRequestException('Tenant context is required to sync template skill assets')
		}

		const mode = input.mode ?? 'incremental'
		const validateOnly = input.validateOnly ?? false
		const updateFingerprint = input.updateFingerprint ?? !validateOnly

		const executeSync = async () => {
			await this.xpertTemplateService.invalidateSkillTemplateCaches()
			const fingerprint = await this.xpertTemplateService.calculateSkillAssetFingerprint()
			const repositories = await this.syncRepositories(validateOnly)
			const indexes = validateOnly
				? this.buildValidationIndexResults(repositories, mode)
				: await this.syncIndexes(repositories, mode)
			const bundles = await this.syncBundles(validateOnly)

			await this.xpertTemplateService.invalidateSkillTemplateCaches()
			const featuredRefs = await this.validateSkillRefs(await this.xpertTemplateService.getSkillsMarketFeaturedRefs())
			const workspaceDefaults = await this.validateSkillRefs(await this.xpertTemplateService.getBootstrapDefaultSkillRefs())
			const result: ITemplateSkillSyncResult = {
				mode,
				validateOnly,
				fingerprint,
				repositories,
				indexes,
				bundles,
				featuredRefs,
				workspaceDefaults,
				summary: {
					repositories: this.summarizeStatuses(repositories.map((item) => item.status)),
					indexes: this.summarizeStatuses(indexes.map((item) => item.status)),
					bundles: this.summarizeStatuses(bundles.map((item) => item.status)),
					featuredRefs: this.summarizeStatuses(featuredRefs.map((item) => item.status)),
					workspaceDefaults: this.summarizeStatuses(workspaceDefaults.map((item) => item.status))
				}
			}

			if (updateFingerprint) {
				await this.cacheManager.set(this.getTenantFingerprintCacheKey(tenantId), fingerprint)
			}

			return result
		}

		if (input.skipLock) {
			return executeSync()
		}

		const result = await this.withTenantSyncLock(tenantId, 'throw', executeSync)
		if (!result) {
			throw new ConflictException('Template skill sync is already running for this tenant')
		}

		return result
	}

	async reconcileTenantsFromTemplates() {
		const tenantIds = await this.listTenantIdsForSync()
		for (const tenantId of tenantIds) {
			const lockAcquired = await this.withTenantSyncLock(tenantId, 'skip', async () => {
				await this.xpertTemplateService.invalidateSkillTemplateCaches()
				const fingerprint = await this.xpertTemplateService.calculateSkillAssetFingerprint()
				const previousFingerprint = await this.cacheManager.get<string>(this.getTenantFingerprintCacheKey(tenantId))
				if (previousFingerprint === fingerprint) {
					return true
				}

				const currentUser = await this.resolveTenantSyncUser(tenantId)
				if (!currentUser?.id) {
					this.#logger.warn(`Skip template skill sync for tenant '${tenantId}' because no admin user is available`)
					return true
				}

				await this.runInTenantContext(currentUser, () =>
					this.syncCurrentTenantSkillAssets({
						mode: 'incremental',
						validateOnly: false,
						skipLock: true,
						updateFingerprint: true
					})
				)

				return true
			})
			if (lockAcquired === null) {
				this.#logger.debug(`Skip template skill sync for tenant '${tenantId}' because another sync is already running`)
			}
		}
	}

	private async syncRepositories(validateOnly: boolean): Promise<ITemplateSkillSyncRepositoryResult[]> {
		const config = await this.xpertTemplateService.readSkillRepositories()
		const results: ITemplateSkillSyncRepositoryResult[] = []

		for (const repositoryEntry of config.repositories) {
			const name = repositoryEntry.name?.trim()
			const provider = repositoryEntry.provider?.trim()
			if (!name || !provider) {
				results.push({
					name: repositoryEntry.name ?? '',
					provider: repositoryEntry.provider ?? '',
					status: 'failed',
					message: 'Repository name and provider are required'
				})
				continue
			}

			try {
				const existing = await this.findExistingRepository(name, provider)
				const status = !existing
					? 'created'
					: this.hasRepositoryConfigChanged(existing, repositoryEntry)
						? 'updated'
						: 'unchanged'

				if (validateOnly || status === 'unchanged') {
					results.push({
						name,
						provider,
						repositoryId: existing?.id,
						status
					})
					continue
				}

				const saved = await this.skillRepositoryService.register({
					...(existing?.id ? { id: existing.id } : {}),
					name,
					provider,
					options: repositoryEntry.options ?? null,
					credentials: repositoryEntry.credentials ?? null
				} as SkillRepository)

				results.push({
					name,
					provider,
					repositoryId: saved.id,
					status
				})
			} catch (error) {
				results.push({
					name,
					provider,
					repositoryId: undefined,
					status: 'failed',
					message: error instanceof Error ? error.message : String(error)
				})
			}
		}

		return results
	}

	private buildValidationIndexResults(
		repositories: ITemplateSkillSyncRepositoryResult[],
		mode: TemplateSkillSyncMode
	): ITemplateSkillSyncIndexResult[] {
		return repositories.map((repository) => ({
			repositoryId: repository.repositoryId,
			repositoryName: repository.name,
			provider: repository.provider,
			mode,
			status: repository.status === 'failed' ? 'failed' : repository.repositoryId ? 'unchanged' : 'missing',
			message: repository.repositoryId
				? 'Validation only skipped repository index sync'
				: repository.message ?? 'Repository would be created during a write sync'
		}))
	}

	private async syncIndexes(
		repositories: ITemplateSkillSyncRepositoryResult[],
		mode: TemplateSkillSyncMode
	): Promise<ITemplateSkillSyncIndexResult[]> {
		const results: ITemplateSkillSyncIndexResult[] = []
		for (const repository of repositories) {
			if (!repository.repositoryId) {
				results.push({
					repositoryId: repository.repositoryId,
					repositoryName: repository.name,
					provider: repository.provider,
					mode,
					status: 'failed',
					message: repository.message ?? 'Repository is missing'
				})
				continue
			}

			try {
				const syncedItems = await this.skillRepositoryIndexService.sync(repository.repositoryId, { mode })
				results.push({
					repositoryId: repository.repositoryId,
					repositoryName: repository.name,
					provider: repository.provider,
					mode,
					status: syncedItems.length ? 'updated' : 'unchanged',
					syncedCount: syncedItems.length
				})
			} catch (error) {
				results.push({
					repositoryId: repository.repositoryId,
					repositoryName: repository.name,
					provider: repository.provider,
					mode,
					status: 'failed',
					message: error instanceof Error ? error.message : String(error)
				})
			}
		}

		return results
	}

	private async syncBundles(validateOnly: boolean): Promise<ITemplateSkillSyncBundleResult[]> {
		const bundles = await this.xpertTemplateService.getTemplateSkillBundles()
		if (!bundles.length) {
			return []
		}

		const workspaceId = validateOnly
			? await this.findTenantDefaultWorkspaceId()
			: (await this.skillPackageService.ensureWorkspacePublicRepositoryContext()).workspace.id
		const results: ITemplateSkillSyncBundleResult[] = []

		for (const bundle of bundles) {
			const baseResult = {
				sharedSkillId: bundle.sharedSkillId,
				provider: bundle.ref.provider,
				repositoryName: bundle.ref.repositoryName,
				skillId: bundle.ref.skillId
			}
			if (!workspaceId) {
				results.push({
					...baseResult,
					status: 'missing',
					message: 'Tenant skill workspace has not been initialized yet'
				})
				continue
			}

			try {
				const bundleResult = await this.skillPackageService.syncTemplateSkillBundle(
					workspaceId,
					{
						bundleRootPath: bundle.directoryPath,
						sharedSkillId: bundle.sharedSkillId
					},
					{
						skipAccessCheck: true,
						validateOnly
					}
				)
				results.push({
					...baseResult,
					status: bundleResult.status,
					hash: bundleResult.hash,
					indexId: bundleResult.index?.id
				})
			} catch (error) {
				results.push({
					...baseResult,
					status: 'failed',
					message: error instanceof Error ? error.message : String(error)
				})
			}
		}

		return results
	}

	private async validateSkillRefs(skillRefs: TWorkspaceDefaultSkillRef[]): Promise<ITemplateSkillSyncRefResult[]> {
		const normalizedRefs = this.deduplicateSkillRefs(skillRefs)
		if (!normalizedRefs.length) {
			return []
		}

		const resolvedSkills = await this.xpertTemplateService.resolveSkillRefs(normalizedRefs)
		const resolvedByKey = new Map(
			resolvedSkills.map(({ ref, skill }) => [this.getSkillRefKey(ref), skill] as const)
		)

		return normalizedRefs.map((ref) => {
			const skill = resolvedByKey.get(this.getSkillRefKey(ref))
			if (!skill) {
				return {
					provider: ref.provider,
					repositoryName: ref.repositoryName,
					skillId: ref.skillId,
					status: 'missing',
					message: 'Unable to resolve skill from synchronized repositories'
				}
			}

			return {
				provider: ref.provider,
				repositoryName: ref.repositoryName,
				skillId: ref.skillId,
				repositoryId: skill.repositoryId,
				indexId: skill.id,
				status: 'unchanged'
			}
		})
	}

	private async findExistingRepository(name: string, provider: string) {
		const { items } = await this.skillRepositoryService.findAll({
			where: {
				name,
				provider
			},
			take: 1
		})

		return items[0] ?? null
	}

	private hasRepositoryConfigChanged(existing: SkillRepository, next: TDefaultSkillRepositoryEntry) {
		return (
			this.serializeValue(existing.options ?? null) !== this.serializeValue(next.options ?? null) ||
			this.serializeValue(existing.credentials ?? null) !== this.serializeValue(next.credentials ?? null)
		)
	}

	private serializeValue(value: unknown) {
		return JSON.stringify(value, (_key, nestedValue) => {
			if (!isObjectValue(nestedValue)) {
				return nestedValue
			}

			return Object.fromEntries(
				Object.keys(nestedValue)
					.sort((left, right) => left.localeCompare(right))
					.map((key) => [key, Reflect.get(nestedValue, key)])
			)
		})
	}

	private deduplicateSkillRefs(skillRefs: TWorkspaceDefaultSkillRef[]) {
		const refsByKey = new Map<string, TWorkspaceDefaultSkillRef>()
		for (const ref of skillRefs) {
			const normalizedRef: TWorkspaceDefaultSkillRef = {
				provider: ref.provider.trim(),
				repositoryName: ref.repositoryName.trim(),
				skillId: ref.skillId.trim()
			}
			const key = this.getSkillRefKey(normalizedRef)
			if (!refsByKey.has(key)) {
				refsByKey.set(key, normalizedRef)
			}
		}

		return Array.from(refsByKey.values())
	}

	private getSkillRefKey(ref: TWorkspaceDefaultSkillRef) {
		return `${ref.provider}:${ref.repositoryName}:${ref.skillId}`
	}

	private summarizeStatuses(statuses: TemplateSkillSyncStatus[]): ITemplateSkillSyncItemSummary {
		const summary = { ...EMPTY_ITEM_SUMMARY }
		for (const status of statuses) {
			summary[status] += 1
		}
		return summary
	}

	private async listTenantIdsForSync() {
		const tenantIds = new Set<string>()
		const repositoryTenants = await this.skillRepositoryRepository
			.createQueryBuilder('repository')
			.select('DISTINCT repository.tenantId', 'tenantId')
			.where('repository.tenantId IS NOT NULL')
			.getRawMany<DistinctTenantRow>()
		const workspaceTenants = await this.workspaceRepository
			.createQueryBuilder('workspace')
			.select('DISTINCT workspace.tenantId', 'tenantId')
			.where('workspace.tenantId IS NOT NULL')
			.getRawMany<DistinctTenantRow>()

		for (const row of [...repositoryTenants, ...workspaceTenants]) {
			const tenantId = typeof row.tenantId === 'string' ? row.tenantId.trim() : ''
			if (tenantId) {
				tenantIds.add(tenantId)
			}
		}

		return Array.from(tenantIds.values())
	}

	private async findTenantDefaultWorkspaceId() {
		const tenantId = RequestContext.currentTenantId()
		if (!tenantId) {
			return null
		}

		const workspace = await this.workspaceRepository
			.createQueryBuilder('workspace')
			.where('workspace.tenantId = :tenantId', { tenantId })
			.andWhere('workspace.organizationId IS NULL')
			.andWhere(`COALESCE((workspace.settings)::jsonb -> 'system' ->> 'kind', '') = :kind`, {
				kind: 'tenant-default'
			})
			.getOne()

		return workspace?.id ?? null
	}

	private async resolveTenantSyncUser(tenantId: string) {
		try {
			const adminUsers = await this.userService.getAdminUsers(tenantId)
			return adminUsers.find((user) => user.role?.name === RolesEnum.SUPER_ADMIN) ?? adminUsers[0] ?? null
		} catch (error) {
			this.#logger.warn(
				`Unable to resolve tenant sync user for tenant '${tenantId}': ${error instanceof Error ? error.message : error}`
			)
			return null
		}
	}

	private getTenantFingerprintCacheKey(tenantId: string) {
		return `${TEMPLATE_SKILL_SYNC_FINGERPRINT_PREFIX}${tenantId}`
	}

	private async withTenantSyncLock<T>(
		tenantId: string,
		busyBehavior: TenantLockBehavior,
		callback: () => Promise<T>
	): Promise<T | null> {
		const manager = this.skillRepositoryRepository.manager
		const connectionType = manager.connection.options.type
		if (connectionType !== 'postgres') {
			return callback()
		}

		const [lockRow] = await manager.query(
			'SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS locked',
			[tenantId, TEMPLATE_SKILL_SYNC_LOCK_NAME]
		)
		const locked = lockRow?.locked === true || lockRow?.locked === 't' || lockRow?.locked === 1
		if (!locked) {
			if (busyBehavior === 'skip') {
				return null
			}
			throw new ConflictException('Template skill sync is already running for this tenant')
		}

		try {
			return await callback()
		} finally {
			await manager
				.query('SELECT pg_advisory_unlock(hashtext($1), hashtext($2))', [
					tenantId,
					TEMPLATE_SKILL_SYNC_LOCK_NAME
				])
				.catch(() => undefined)
		}
	}

	private async runInTenantContext<T>(user: IUser, callback: () => Promise<T>) {
		const request = {
			user,
			headers: {
				language: user.preferredLanguage ?? LanguagesEnum.English,
				'x-scope-level': 'tenant'
			}
		}

		return new Promise<T>((resolve, reject) => {
			runWithRequestContext(
				request,
				{},
				() => {
					const scopedRequest = RequestContext.currentRequest() ?? request
					runWithLegacyRequestContext(scopedRequest, () => {
						callback().then(resolve).catch(reject)
					})
				}
			)
		})
	}
}
