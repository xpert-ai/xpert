import {
	OrganizationCreatedEvent,
	OrganizationService,
	runWithRequestContext,
	UserOrganizationService,
	UserService
} from '@metad/server-core'
import { InjectRepository } from '@nestjs/typeorm'
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Repository } from 'typeorm'
import { DataSourceTypeService } from '../data-source-type'
import { SemanticModelService } from '../model'
import {
	BusinessArea,
	BusinessAreaUser,
	DataSource,
	Indicator,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget,
} from '../core/entities/internal'
import {
	AnalyticsBootstrapMode,
	seedOrganizationAnalyticsData
} from '../core/events/handlers/seeds'
import { CommandBus, ICommand } from '@nestjs/cqrs'
import {
	LanguagesEnum,
	IUser,
	OrgGenerateDemoOptions,
	OrganizationDemoNetworkEnum,
	RolesEnum
} from '@metad/contracts'

@Injectable()
export class AnalyticsBootstrapService {
	constructor(
		private readonly configService: ConfigService,
		private readonly organizationService: OrganizationService,
		private readonly userService: UserService,
		private readonly userOrganizationService: UserOrganizationService,
		@InjectRepository(DataSource)
		private readonly dsRepository: Repository<DataSource>,
		@InjectRepository(SemanticModel)
		private readonly modelRepository: Repository<SemanticModel>,
		@InjectRepository(Story)
		private readonly storyRepository: Repository<Story>,
		@InjectRepository(StoryPoint)
		private readonly storyPointRepository: Repository<StoryPoint>,
		@InjectRepository(StoryWidget)
		private readonly storyWidgetRepository: Repository<StoryWidget>,
		@InjectRepository(BusinessArea)
		private readonly businessAreaRepository: Repository<BusinessArea>,
		@InjectRepository(BusinessAreaUser)
		private readonly businessAreaUserRepository: Repository<BusinessAreaUser>,
		@InjectRepository(Indicator)
		private readonly indicatorRepository: Repository<Indicator>,
		private readonly dstService: DataSourceTypeService,
		private readonly modelService: SemanticModelService,
		private readonly commandBus: CommandBus<ICommand>
	) {}

	async bootstrapOrganization(event: OrganizationCreatedEvent) {
		const owner = await this.resolveBootstrapUserWithTrialRetry(event.organizationId, event.ownerUserId)

		await this.runInOrganizationContext(owner, event.organizationId, async () => {
			if (this.isTrialUser(owner)) {
				await this.organizationService.generateDemo(event.organizationId, this.getBootstrapDemoOptions())
				return
			}

			const organization = await this.organizationService.findOne(event.organizationId)
			await seedOrganizationAnalyticsData(
				this.dstService,
				this.dsRepository,
				this.businessAreaRepository,
				this.businessAreaUserRepository,
				this.modelRepository,
				this.modelService,
				this.storyRepository,
				this.storyPointRepository,
				this.storyWidgetRepository,
				this.indicatorRepository,
				organization.tenantId,
				owner.id,
				event.organizationId,
				this.commandBus,
				{
					mode: this.getBootstrapMode()
				}
			)
		})
	}

	private async resolveBootstrapUser(organizationId: string, preferredUserId?: string | null) {
		const memberIds = await this.userOrganizationService.findUserIdsByOrganization(organizationId)
		const userIds = Array.from(new Set([preferredUserId, ...memberIds].filter(Boolean)))
		if (!userIds.length) {
			throw new Error(`No organization member found for analytics bootstrap '${organizationId}'`)
		}

		const users = (
			await Promise.all(userIds.map((userId) => this.tryResolveUser(userId)))
		).filter(Boolean)
		const trialUser = users.find((user) => this.isTrialUser(user))
		if (trialUser) {
			return trialUser
		}

		const preferredUser = preferredUserId ? users.find((user) => user.id === preferredUserId) : null
		if (preferredUser) {
			return preferredUser
		}

		const [firstUser] = users
		if (!firstUser) {
			throw new Error(`No resolvable organization member found for analytics bootstrap '${organizationId}'`)
		}

		return firstUser
	}

	private async resolveBootstrapUserWithTrialRetry(organizationId: string, preferredUserId?: string | null) {
		const owner = await this.resolveBootstrapUser(organizationId, preferredUserId)
		if (owner.role?.name !== RolesEnum.SUPER_ADMIN) {
			return owner
		}

		for (let attempt = 0; attempt < 10; attempt++) {
			await this.delay(500)
			const candidate = await this.resolveBootstrapUser(organizationId, preferredUserId)
			if (this.isTrialUser(candidate)) {
				return candidate
			}
		}

		return owner
	}

	private getBootstrapMode(): AnalyticsBootstrapMode {
		const mode = this.configService.get<string>('ORG_ANALYTICS_BOOTSTRAP_MODE')
		return mode === 'full-demo' ? 'full-demo' : 'semantic-only'
	}

	private getBootstrapDemoOptions(): OrgGenerateDemoOptions {
		return {
			source:
				this.configService.get<string>('ORG_ANALYTICS_BOOTSTRAP_DEMO_SOURCE') ??
				OrganizationDemoNetworkEnum.github,
			importData: true
		}
	}

	private isTrialUser(user: IUser | null | undefined): boolean {
		return user?.role?.name === RolesEnum.TRIAL
	}

	private async tryResolveUser(userId: string): Promise<IUser | null> {
		try {
			return await this.userService.findOne(userId, { relations: ['role'] })
		} catch {
			return null
		}
	}

	private async delay(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms))
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
