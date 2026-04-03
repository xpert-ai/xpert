import { LanguagesEnum, TXpertTeamDraft, IUser } from '@metad/contracts'
import { getErrorMessage, yaml } from '@metad/server-common'
import {
	OrganizationCreatedEvent,
	OrganizationService,
	runWithRequestContext,
	UserOrganizationCreatedEvent,
	UserOrganizationService,
	UserService
} from '@metad/server-core'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ConfigService } from '@nestjs/config'
import { XpertImportCommand, XpertService } from '../xpert'
import { EnvironmentService } from '../environment'
import { XpertTemplateService } from '../xpert-template/xpert-template.service'
import { XpertWorkspaceService } from '../xpert-workspace/workspace.service'
import { DEFAULT_ENVIRONMENT_NAME, DEFAULT_ORGANIZATION_WORKSPACE_NAME } from './constants'

@Injectable()
export class ServerAIBootstrapService {
	private readonly logger = new Logger(ServerAIBootstrapService.name)

	constructor(
		private readonly configService: ConfigService,
		private readonly commandBus: CommandBus,
		private readonly organizationService: OrganizationService,
		private readonly userService: UserService,
		private readonly userOrganizationService: UserOrganizationService,
		private readonly workspaceService: XpertWorkspaceService,
		private readonly environmentService: EnvironmentService,
		private readonly xpertService: XpertService,
		private readonly xpertTemplateService: XpertTemplateService
	) {}

	async bootstrapOrganization(event: OrganizationCreatedEvent) {
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
				workspaceId: workspace.id
			})
		})
	}

	async bootstrapUserInOrganization(event: UserOrganizationCreatedEvent) {
		const user = await this.userService.findOne(event.userId, { relations: ['role'] })

		await this.runInOrganizationContext(user, event.organizationId, async () => {
			if (event.bootstrapPersonalWorkspace) {
				const workspace = await this.ensureUserWorkspace(event.organizationId, user)
				await this.ensureDefaultEnvironment(workspace.id)
			}

			const organizationWorkspace = await this.workspaceService.findOrganizationDefaultWorkspace(event.organizationId)
			if (organizationWorkspace) {
				await this.workspaceService.ensureMember(organizationWorkspace.id, user.id)
			}
		})
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
		workspaceId
	}: {
		organizationId: string
		organizationName: string
		owner: IUser
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
