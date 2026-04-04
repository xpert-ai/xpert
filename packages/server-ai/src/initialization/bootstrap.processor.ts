import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Job, Queue } from 'bull'
import { EVENT_ORGANIZATION_CREATED, EVENT_TENANT_CREATED, OrganizationCreatedEvent, TenantCreatedEvent } from '@metad/server-core'
import { EVENT_USER_ORGANIZATION_CREATED, UserOrganizationCreatedEvent } from '@metad/server-core'
import {
	AI_BOOTSTRAP_QUEUE,
	AI_ORGANIZATION_BOOTSTRAP_JOB,
	AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB,
	AI_TENANT_SKILL_REPOSITORY_BOOTSTRAP_JOB,
	AI_USER_ORGANIZATION_BOOTSTRAP_JOB
} from './constants'
import { ServerAIBootstrapService } from './bootstrap.service'

type OrganizationSkillRepositorySyncJob = {
	tenantId: string
	organizationId: string
	repositoryId: string
	ownerUserId?: string | null
}

@Processor(AI_BOOTSTRAP_QUEUE)
export class ServerAIBootstrapProcessor {
	private readonly logger = new Logger(ServerAIBootstrapProcessor.name)

	constructor(
		@InjectQueue(AI_BOOTSTRAP_QUEUE)
		private readonly bootstrapQueue: Queue,
		private readonly bootstrapService: ServerAIBootstrapService
	) {}

	@OnEvent(EVENT_ORGANIZATION_CREATED)
	async enqueueOrganizationBootstrap(event: OrganizationCreatedEvent) {
		await this.bootstrapQueue.add(AI_ORGANIZATION_BOOTSTRAP_JOB, event, {
			jobId: `org-bootstrap:${event.organizationId}`,
			attempts: 3,
			backoff: 10_000,
			removeOnComplete: true
		})
	}

	@OnEvent(EVENT_TENANT_CREATED)
	async enqueueTenantSkillRepositoryBootstrap(event: TenantCreatedEvent) {
		await this.bootstrapQueue.add(AI_TENANT_SKILL_REPOSITORY_BOOTSTRAP_JOB, event, {
			jobId: `tenant-skill-repository-bootstrap:${event.tenantId}`,
			attempts: 3,
			backoff: 10_000,
			removeOnComplete: true
		})
	}

	@OnEvent(EVENT_USER_ORGANIZATION_CREATED)
	async enqueueUserOrganizationBootstrap(event: UserOrganizationCreatedEvent) {
		await this.bootstrapQueue.add(AI_USER_ORGANIZATION_BOOTSTRAP_JOB, event, {
			jobId: `user-org-bootstrap:${event.organizationId}:${event.userId}`,
			attempts: 3,
			backoff: 10_000,
			removeOnComplete: true
		})
	}

	@Process(AI_ORGANIZATION_BOOTSTRAP_JOB)
	async handleOrganizationBootstrap(job: Job<OrganizationCreatedEvent>) {
		try {
			await this.bootstrapService.bootstrapOrganization(job.data)
		} catch (error) {
			this.logger.error(
				`Failed organization bootstrap for '${job.data.organizationId}': ${error instanceof Error ? error.stack : error}`
			)
			throw error
		}
	}

	@Process(AI_TENANT_SKILL_REPOSITORY_BOOTSTRAP_JOB)
	async handleTenantSkillRepositoryBootstrap(job: Job<TenantCreatedEvent>) {
		try {
			const result = await this.bootstrapService.bootstrapTenantSkillRepositories(job.data)
			await Promise.all(
				(result.repositories ?? []).map(({ organizationId, repositoryId }) =>
					this.bootstrapQueue.add(
						AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB,
						{
							tenantId: job.data.tenantId,
							organizationId,
							repositoryId
						},
						{
							jobId: `org-skill-repository-sync:${organizationId}:${repositoryId}`,
							attempts: 3,
							backoff: 10_000,
							removeOnComplete: true
						}
					)
				)
			)
		} catch (error) {
			this.logger.error(
				`Failed tenant skill repository bootstrap for '${job.data.tenantId}': ${error instanceof Error ? error.stack : error}`
			)
			throw error
		}
	}

	@Process(AI_USER_ORGANIZATION_BOOTSTRAP_JOB)
	async handleUserOrganizationBootstrap(job: Job<UserOrganizationCreatedEvent>) {
		try {
			await this.bootstrapService.bootstrapUserInOrganization(job.data)
		} catch (error) {
			this.logger.error(
				`Failed user organization bootstrap for '${job.data.organizationId}:${job.data.userId}': ${
					error instanceof Error ? error.stack : error
				}`
			)
			throw error
		}
	}

	@Process(AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB)
	async handleOrganizationSkillRepositorySync(job: Job<OrganizationSkillRepositorySyncJob>) {
		try {
			await this.bootstrapService.syncOrganizationSkillRepository(job.data)
		} catch (error) {
			this.logger.error(
				`Failed organization skill repository sync for '${job.data.organizationId}:${job.data.repositoryId}': ${
					error instanceof Error ? error.stack : error
				}`
			)
			throw error
		}
	}
}
