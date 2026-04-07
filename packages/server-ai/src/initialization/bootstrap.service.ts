import {
	AiModelTypeEnum,
	AiProviderRole,
	ISkillRepository,
	LanguagesEnum,
	RolesEnum,
	TCopilotModel,
	TXpertTeamDraft,
	IUser,
	WorkflowNodeTypeEnum
} from '@metad/contracts'
import { getErrorMessage, yaml } from '@metad/server-common'
import {
	OrganizationCreatedEvent,
	OrganizationService,
	runWithRequestContext,
	TenantCreatedEvent,
	UserOrganizationCreatedEvent,
	UserOrganizationDeletedEvent,
	UserOrganizationService,
	UserService
} from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import { CopilotOneByRoleQuery, FindCopilotModelsQuery } from '../copilot/queries'
import { SkillRepositoryIndexService, SkillRepositoryService } from '../skill-repository'
import { XpertImportCommand, XpertService } from '../xpert'
import { EnvironmentService } from '../environment'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { DEFAULT_ENVIRONMENT_NAME, DEFAULT_ORGANIZATION_WORKSPACE_NAME } from './constants'

type DefaultSkillRepositoryConfig = {
	repositories?: Array<Pick<ISkillRepository, 'name' | 'provider'> & Partial<Pick<ISkillRepository, 'options' | 'credentials'>>>
}

export type OrganizationBootstrapResult = {
	repositoryIds: string[]
}

export type TenantSkillRepositoryBootstrapResult = {
	repositories: Array<{
		organizationId: string
		repositoryId: string
	}>
}

const DEFAULT_SKILL_REPOSITORIES_ENV = 'AI_DEFAULT_SKILL_REPOSITORIES'
const DEFAULT_ORGANIZATION_ASSISTANT_TEMPLATE_KEY = 'xpert-authoring-assistant'

type DefaultSkillRepositoryEntry = Pick<ISkillRepository, 'name' | 'provider'> &
	Partial<Pick<ISkillRepository, 'options' | 'credentials'>>

type BootstrapModelScanContext = {
	nodeType?: string
	workflowEntityType?: WorkflowNodeTypeEnum | string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value)

const isDefaultSkillRepositoryEntry = (value: unknown): value is DefaultSkillRepositoryEntry =>
	isRecord(value) && typeof value.name === 'string' && typeof value.provider === 'string'

@Injectable()
export class ServerAIBootstrapService {
	private readonly logger = new Logger(ServerAIBootstrapService.name)

	constructor(
		private readonly configService: ConfigService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus,
		private readonly organizationService: OrganizationService,
		private readonly userService: UserService,
		private readonly userOrganizationService: UserOrganizationService,
		private readonly workspaceService: XpertWorkspaceService,
		private readonly environmentService: EnvironmentService,
		private readonly skillRepositoryService: SkillRepositoryService,
		private readonly skillRepositoryIndexService: SkillRepositoryIndexService,
		private readonly xpertService: XpertService,
		private readonly xpertTemplateService: XpertTemplateService
	) {}

	async bootstrapOrganization(event: OrganizationCreatedEvent): Promise<OrganizationBootstrapResult> {
		const owner = await this.resolveBootstrapUser(event.organizationId, event.ownerUserId)
		const organization = await this.organizationService.findOne(event.organizationId)
		const memberIds = await this.userOrganizationService.findUserIdsByOrganization(event.organizationId)

		await this.runInOrganizationContext(owner, event.organizationId, async () => {
			const workspace = await this.ensureOrganizationWorkspace(event.organizationId, owner.id)
			await this.ensureDefaultEnvironment(workspace.id)

			for (const memberId of memberIds) {
				await this.workspaceService.ensureMember(workspace.id, memberId)
			}

			await this.importDefaultTemplates({
				organizationId: event.organizationId,
				organizationName: organization.name,
				owner,
				tenantId: event.tenantId,
				workspaceId: workspace.id
			})
		})

		return {
			repositoryIds: []
		}
	}

	async bootstrapTenantSkillRepositories(event: TenantCreatedEvent): Promise<TenantSkillRepositoryBootstrapResult> {
		const configuredRepositories = this.loadDefaultSkillRepositories()
		if (!configuredRepositories.length) {
			return { repositories: [] }
		}

		const owner = await this.resolveTenantBootstrapUser(event.tenantId)
		const { items: organizations } = await this.organizationService.findAll({
			where: {
				tenantId: event.tenantId
			}
		})
		const repositories: TenantSkillRepositoryBootstrapResult['repositories'] = []

		if (!organizations?.length) {
			this.logger.warn(`No organizations found for tenant '${event.tenantId}' during skill repository bootstrap`)
			return { repositories }
		}

		for (const organization of organizations) {
			if (!organization?.id) {
				continue
			}

			const repositoryIds = await this.runInOrganizationContext(owner, organization.id, async () =>
				this.ensureOrganizationSkillRepositories(configuredRepositories, organization.id)
			)
			repositories.push(
				...repositoryIds.map((repositoryId) => ({
					organizationId: organization.id,
					repositoryId
				}))
			)
		}

		return { repositories }
	}

	async bootstrapUserInOrganization(event: UserOrganizationCreatedEvent) {
		const user = await this.userService.findOne(event.userId, { relations: ['role'] })

		await this.runInOrganizationContext(user, event.organizationId, async () => {
			if (this.shouldBootstrapPersonalWorkspace(user)) {
				const workspace = await this.ensureUserWorkspace(event.organizationId, user)
				await this.ensureDefaultEnvironment(workspace.id)
			}

			const organizationWorkspace = await this.workspaceService.findOrganizationDefaultWorkspace(event.organizationId)
			if (organizationWorkspace) {
				await this.workspaceService.ensureMember(organizationWorkspace.id, user.id)
			}
		})
	}

	async cleanupUserInOrganization(event: UserOrganizationDeletedEvent) {
		await this.workspaceService.removeMemberFromOrganizationWorkspaces(
			event.tenantId,
			event.organizationId,
			event.userId
		)
	}

	async syncOrganizationSkillRepository(event: {
		tenantId: string
		organizationId: string
		repositoryId: string
		ownerUserId?: string | null
	}) {
		const owner = await this.resolveSyncBootstrapUser(event)

		await this.runInOrganizationContext(owner, event.organizationId, async () => {
			await this.skillRepositoryIndexService.sync(event.repositoryId, { mode: 'full' })
		})
	}

	private async ensureOrganizationSkillRepositories(
		repositories = this.loadDefaultSkillRepositories(),
		organizationId?: string
	) {
		if (!repositories.length) {
			return []
		}

		const repositoryIds: string[] = []
		for (const repository of repositories) {
			const name = repository.name?.trim()
			const provider = repository.provider?.trim()
			if (!name || !provider) {
				this.logger.warn(`Skipping invalid default skill repository entry: ${JSON.stringify(repository)}`)
				continue
			}

			try {
				const { items } = await this.skillRepositoryService.findAll({
					where: {
						name,
						provider
					} as any,
					take: 1
				})
				const existing = items[0]
				const saved = await this.skillRepositoryService.register({
					...(existing ? { id: existing.id } : {}),
					name,
					provider,
					options: repository.options ?? null,
					credentials: repository.credentials ?? null
				} as any)

				if (saved?.id) {
					repositoryIds.push(saved.id)
				}
			} catch (error) {
				this.logger.error(
					`Failed to initialize default skill repository '${name}' (${provider}) for organization '${
						organizationId ?? 'unknown'
					}': ${getErrorMessage(error)}`,
					error as Error
				)
			}
		}

		return repositoryIds
	}

	private loadDefaultSkillRepositories() {
		try {
			const content = this.configService.get<string>(DEFAULT_SKILL_REPOSITORIES_ENV)?.trim()
			if (!content) {
				return []
			}

			const parsed = JSON.parse(content) as DefaultSkillRepositoryConfig | DefaultSkillRepositoryEntry[]
			const repositories = Array.isArray(parsed)
				? parsed
				: Array.isArray(parsed?.repositories)
					? parsed.repositories
					: []

			return repositories.filter(isDefaultSkillRepositoryEntry)
		} catch (error) {
			this.logger.warn(
				`Failed to load default skill repositories from env '${DEFAULT_SKILL_REPOSITORIES_ENV}': ${getErrorMessage(error)}`
			)
			return []
		}
	}

	private async resolveBootstrapUser(organizationId: string, preferredUserId?: string | null) {
		if (preferredUserId) {
			try {
				return await this.userService.findOne(preferredUserId, { relations: ['role'] })
			} catch (error) {
				this.logger.warn(
					`Failed to resolve preferred bootstrap user '${preferredUserId}' for organization '${organizationId}': ${getErrorMessage(
						error
					)}`
				)
			}
		}

		const [userId] = await this.userOrganizationService.findUserIdsByOrganization(organizationId)
		if (!userId) {
			throw new Error(`No organization member found for bootstrap '${organizationId}'`)
		}

		return this.userService.findOne(userId, { relations: ['role'] })
	}

	private async resolveTenantBootstrapUser(tenantId: string) {
		const adminUsers = await this.userService.getAdminUsers(tenantId)
		const owner = adminUsers.find((user) => user.role?.name === RolesEnum.SUPER_ADMIN) ?? adminUsers[0]
		if (!owner?.id) {
			throw new Error(`No tenant bootstrap user found for tenant '${tenantId}'`)
		}

		return this.userService.findOne(owner.id, { relations: ['role'] })
	}

	private async resolveSyncBootstrapUser(event: {
		tenantId: string
		organizationId: string
		ownerUserId?: string | null
	}) {
		if (event.ownerUserId) {
			try {
				return await this.userService.findOne(event.ownerUserId, { relations: ['role'] })
			} catch (error) {
				this.logger.warn(
					`Failed to resolve preferred sync user '${event.ownerUserId}' for organization '${event.organizationId}': ${getErrorMessage(
						error
					)}`
				)
			}
		}

		return this.resolveBootstrapUser(event.organizationId).catch(() => this.resolveTenantBootstrapUser(event.tenantId))
	}

	private async ensureOrganizationWorkspace(organizationId: string, ownerId: string) {
		let workspace = await this.workspaceService.findOrganizationDefaultWorkspace(organizationId)

		if (!workspace) {
			workspace = await this.workspaceService.create({
				name: DEFAULT_ORGANIZATION_WORKSPACE_NAME,
				status: 'active',
				ownerId,
				settings: {
					system: {
						kind: 'org-default'
					}
				}
			})
		}

		if (!workspace.ownerId) {
			await this.workspaceService.update(workspace.id, { ownerId })
			workspace = await this.workspaceService.findOne(workspace.id)
		}

		return workspace
	}

	private async ensureUserWorkspace(organizationId: string, user: IUser) {
		let workspace = await this.workspaceService.findUserDefaultWorkspace(organizationId, user.id)

		if (!workspace) {
			workspace = await this.workspaceService.create({
				name: `${this.getUserDisplayName(user)} Workspace`,
				status: 'active',
				ownerId: user.id,
				settings: {
					system: {
						kind: 'user-default',
						userId: user.id
					}
				}
			})
		}

		await this.workspaceService.ensureMember(workspace.id, user.id)
		return workspace
	}

	private shouldBootstrapPersonalWorkspace(user: IUser) {
		return user.role?.name !== RolesEnum.SUPER_ADMIN
	}

	private async ensureDefaultEnvironment(workspaceId: string) {
		const existing = await this.environmentService.getDefaultByWorkspace(workspaceId)
		if (existing) {
			return existing
		}

		return this.environmentService.create({
			name: DEFAULT_ENVIRONMENT_NAME,
			workspaceId,
			isDefault: true,
			variables: []
		})
	}

	private async importDefaultTemplates({
		organizationId,
		organizationName,
		owner,
		tenantId,
		workspaceId
	}: {
		organizationId: string
		organizationName: string
		owner: IUser
		tenantId: string
		workspaceId: string
	}) {
		const templateKeys = this.getDefaultTemplateKeys()
		if (!templateKeys.length) {
			return
		}

		for (const templateKey of templateKeys) {
			const template = await this.xpertTemplateService.getTemplateDetail(
				templateKey,
				(owner.preferredLanguage as LanguagesEnum) ?? LanguagesEnum.English
			)
			const draft = yaml.parse(template.export_data) as TXpertTeamDraft
			if (!draft?.team) {
				this.logger.warn(`Template '${templateKey}' has no team definition, skipping`)
				continue
			}
			await this.applyDefaultAssistantPrimaryModel({
				draft,
				organizationId,
				templateKey,
				tenantId
			})

			const existing = await this.findBootstrapXpert(workspaceId, templateKey)
			const name = existing
				? existing.name
				: await this.resolveTemplateImportName(
						draft.team.name || template.name || templateKey,
						organizationName,
						organizationId
				  )

			draft.team = {
				...draft.team,
				name,
				workspaceId,
				options: {
					...(draft.team.options ?? {}),
					bootstrap: {
						source: 'template',
						templateKey,
						workspaceKind: 'org-default'
					}
				}
			}

			await this.commandBus.execute(
				new XpertImportCommand(draft, existing ? { targetXpertId: existing.id } : {})
			)
		}
	}

	private async applyDefaultAssistantPrimaryModel({
		draft,
		organizationId,
		templateKey,
		tenantId
	}: {
		draft: TXpertTeamDraft
		organizationId: string
		templateKey: string
		tenantId: string | null
	}) {
		if (templateKey !== DEFAULT_ORGANIZATION_ASSISTANT_TEMPLATE_KEY || !tenantId) {
			return
		}

		const primaryCopilot = await this.queryBus.execute(
			new CopilotOneByRoleQuery(tenantId, organizationId, AiProviderRole.Primary)
		)
		const primaryModel = primaryCopilot?.copilotModel
		if (
			!primaryCopilot?.id ||
			!primaryModel?.model?.trim() ||
			(primaryModel.modelType && primaryModel.modelType !== AiModelTypeEnum.LLM)
		) {
			this.logger.warn(
				`Skipping default primary model injection for template '${templateKey}' in organization '${organizationId}' because no enabled primary LLM copilot is configured`
			)
			return
		}

		const availableCopilots = await this.queryBus.execute(new FindCopilotModelsQuery(AiModelTypeEnum.LLM))
		const primaryModelAvailable = (availableCopilots ?? []).some(
			(copilot) =>
				copilot?.id === primaryCopilot.id &&
				(copilot.providerWithModels?.models ?? []).some(
					(model) =>
						model?.model === primaryModel.model &&
						(model?.model_type ?? AiModelTypeEnum.LLM) === AiModelTypeEnum.LLM
				)
		)
		if (!primaryModelAvailable) {
			this.logger.warn(
				`Skipping default primary model injection for template '${templateKey}' in organization '${organizationId}' because primary model '${primaryModel.model}' is not available`
			)
			return
		}

		const changed = this.injectPrimaryLlmSelectionForMissingCopilotIds(draft, {
			copilotId: primaryCopilot.id,
			model: primaryModel.model,
			modelType: AiModelTypeEnum.LLM,
			options: primaryModel.options ?? null
		})
		if (changed) {
			this.logger.log(
				`Applied primary default model '${primaryModel.model}' to bootstrap template '${templateKey}' in organization '${organizationId}'`
			)
		}
	}

	private injectPrimaryLlmSelectionForMissingCopilotIds(
		draft: TXpertTeamDraft,
		selection: Pick<TCopilotModel, 'copilotId' | 'model' | 'modelType' | 'options'>
	) {
		let changed = false

		const visit = (value: unknown, context: BootstrapModelScanContext = {}) => {
			if (Array.isArray(value)) {
				value.forEach((item) => visit(item, context))
				return
			}

			if (!isRecord(value)) {
				return
			}

			for (const [key, child] of Object.entries(value)) {
				const childRecord = isRecord(child) ? child : null
				const nextContext = this.extendBootstrapModelScanContext(value, key, childRecord, context)

				if (childRecord && this.shouldTreatAsBootstrapModelTarget(key, childRecord, nextContext)) {
					const modelType = this.inferBootstrapTargetModelType(key, nextContext, childRecord)
					const configuredCopilotId =
						typeof childRecord['copilotId'] === 'string' ? childRecord['copilotId'].trim() : ''

					if (!configuredCopilotId && modelType === AiModelTypeEnum.LLM) {
						childRecord['copilotId'] = selection.copilotId
						childRecord['model'] = selection.model
						childRecord['modelType'] = selection.modelType
						if (!isRecord(childRecord['options']) && selection.options) {
							childRecord['options'] = structuredClone(selection.options)
						}
						changed = true
					}
				}

				visit(child, nextContext)
			}
		}

		visit(draft)
		return changed
	}

	private extendBootstrapModelScanContext(
		record: Record<string, unknown>,
		key: string,
		child: Record<string, unknown> | null,
		context: BootstrapModelScanContext
	): BootstrapModelScanContext {
		if (key === 'entity' && child) {
			return {
				...context,
				nodeType: typeof record['type'] === 'string' ? record['type'] : context.nodeType,
				workflowEntityType:
					typeof child['type'] === 'string' ? (child['type'] as WorkflowNodeTypeEnum) : context.workflowEntityType
			}
		}

		return context
	}

	private shouldTreatAsBootstrapModelTarget(
		key: string,
		value: Record<string, unknown>,
		context: BootstrapModelScanContext
	) {
		if (key === 'model') {
			return this.isBootstrapCopilotModelConfig(value) || context.workflowEntityType === WorkflowNodeTypeEnum.MIDDLEWARE
		}

		return key.endsWith('Model')
	}

	private inferBootstrapTargetModelType(
		key: string,
		context: BootstrapModelScanContext,
		value: Record<string, unknown>
	): AiModelTypeEnum {
		const explicitModelType =
			typeof value['modelType'] === 'string' && value['modelType'].trim()
				? (value['modelType'] as AiModelTypeEnum)
				: null
		if (explicitModelType) {
			return explicitModelType
		}

		if (key === 'copilotModel' && context.nodeType === 'knowledge') {
			return AiModelTypeEnum.TEXT_EMBEDDING
		}

		return AiModelTypeEnum.LLM
	}

	private isBootstrapCopilotModelConfig(value: Record<string, unknown>) {
		return (
			'model' in value ||
			'copilotId' in value ||
			'copilot' in value ||
			'modelType' in value ||
			'options' in value
		)
	}

	private findBootstrapXpert(workspaceId: string, templateKey: string) {
		return this.xpertService.repository
			.createQueryBuilder('xpert')
			.where('xpert.workspaceId = :workspaceId', { workspaceId })
			.andWhere('xpert.latest = true')
			.andWhere('xpert.deletedAt IS NULL')
			.andWhere(
				`COALESCE((xpert.options)::jsonb -> 'bootstrap' ->> 'templateKey', '') = :templateKey`,
				{ templateKey }
			)
			.andWhere(
				`COALESCE((xpert.options)::jsonb -> 'bootstrap' ->> 'workspaceKind', '') = :workspaceKind`,
				{ workspaceKind: 'org-default' }
			)
			.getOne()
	}

	private async resolveTemplateImportName(templateName: string, organizationName: string, organizationId: string) {
		const candidates = [
			templateName,
			`${templateName} (${organizationName})`,
			`${templateName} (${organizationName} ${organizationId.slice(0, 8)})`
		]

		for (const candidate of candidates) {
			if (await this.xpertService.validateName(candidate)) {
				return candidate
			}
		}

		throw new Error(`Unable to resolve unique xpert name for template '${templateName}'`)
	}

	private getDefaultTemplateKeys() {
		return (this.configService.get<string>('ORG_DEFAULT_XPERT_TEMPLATE_KEYS') ?? '')
			.split(',')
			.map((key) => key.trim())
			.filter(Boolean)
	}

	private getUserDisplayName(user: Partial<IUser>) {
		const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
		return user.name || fullName || user.email || user.username || 'User'
	}

	private async runInOrganizationContext<T>(user: IUser, organizationId: string, callback: () => Promise<T>) {
		return new Promise<T>((resolve, reject) => {
			runWithRequestContext(
				{
					user,
					headers: {
						['organization-id']: organizationId,
						language: user.preferredLanguage ?? LanguagesEnum.English
					}
				},
				() => {
					callback().then(resolve).catch(reject)
				}
			)
		})
	}
}
