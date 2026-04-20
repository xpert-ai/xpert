import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Job, Queue } from 'bull'
import { EVENT_ORGANIZATION_CREATED, EVENT_TENANT_CREATED, OrganizationCreatedEvent, TenantCreatedEvent } from '@xpert-ai/server-core'
import { EVENT_USER_ORGANIZATION_CREATED, UserOrganizationCreatedEvent } from '@xpert-ai/server-core'
import { EVENT_USER_ORGANIZATION_DELETED, UserOrganizationDeletedEvent } from '@xpert-ai/server-core'
import {
	AI_BOOTSTRAP_QUEUE,
	AI_ORGANIZATION_BOOTSTRAP_JOB,
	AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB,
	AI_TENANT_SKILL_REPOSITORY_BOOTSTRAP_JOB,
	AI_USER_DEFAULT_WORKSPACE_SKILLS_BOOTSTRAP_JOB,
	AI_USER_ORGANIZATION_BOOTSTRAP_JOB,
	AI_USER_ORGANIZATION_CLEANUP_JOB
} from './constants'
import { ServerAIBootstrapService } from './bootstrap.service'

type SkillRepositorySyncJob = {
	tenantId: string
	organizationId?: string | null
	repositoryId: string
	ownerUserId?: string | null
}

type UserDefaultWorkspaceSkillsBootstrapJob = {
	tenantId: string
	organizationId: string
	userId: string
	workspaceId: string
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

	@OnEvent(EVENT_USER_ORGANIZATION_DELETED)
	async enqueueUserOrganizationCleanup(event: UserOrganizationDeletedEvent) {
		await this.bootstrapQueue.add(AI_USER_ORGANIZATION_CLEANUP_JOB, event, {
			jobId: `user-org-cleanup:${event.organizationId}:${event.userId}`,
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
			await this.bootstrapService.bootstrapTenantSkillRepositories(job.data)
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
			const result = await this.bootstrapService.bootstrapUserInOrganization(job.data)
			if (result.workspaceId && result.createdNewUserDefaultWorkspace) {
				await this.bootstrapQueue.add(
					AI_USER_DEFAULT_WORKSPACE_SKILLS_BOOTSTRAP_JOB,
					{
						tenantId: job.data.tenantId,
						organizationId: job.data.organizationId,
						userId: job.data.userId,
						workspaceId: result.workspaceId
					},
					{
						jobId: `user-default-skills:${result.workspaceId}`,
						attempts: 8,
						backoff: 30_000,
						removeOnComplete: true
					}
				)
			}
		} catch (error) {
			this.logger.error(
				`Failed user organization bootstrap for '${job.data.organizationId}:${job.data.userId}': ${
					error instanceof Error ? error.stack : error
				}`
			)
			throw error
		}
	}

	@Process(AI_USER_DEFAULT_WORKSPACE_SKILLS_BOOTSTRAP_JOB)
	async handleUserDefaultWorkspaceSkillsBootstrap(job: Job<UserDefaultWorkspaceSkillsBootstrapJob>) {
		try {
			await this.bootstrapService.bootstrapUserDefaultWorkspaceSkills(job.data)
		} catch (error) {
			this.logger.error(
				`Failed default workspace skills bootstrap for '${job.data.workspaceId}': ${
					error instanceof Error ? error.stack : error
				}`
			)
			throw error
		}
	}

	@Process(AI_USER_ORGANIZATION_CLEANUP_JOB)
	async handleUserOrganizationCleanup(job: Job<UserOrganizationDeletedEvent>) {
		try {
			await this.bootstrapService.cleanupUserInOrganization(job.data)
		} catch (error) {
			this.logger.error(
				`Failed user organization cleanup for '${job.data.organizationId}:${job.data.userId}': ${
					error instanceof Error ? error.stack : error
				}`
			)
			throw error
		}
	}

	@Process(AI_ORGANIZATION_SKILL_REPOSITORY_SYNC_JOB)
	async handleOrganizationSkillRepositorySync(job: Job<SkillRepositorySyncJob>) {
		try {
			await this.bootstrapService.syncSkillRepository(job.data)
		} catch (error) {
			const scopeLabel = job.data.organizationId
				? `${job.data.organizationId}:${job.data.repositoryId}`
				: `${job.data.tenantId}:${job.data.repositoryId}`
			this.logger.error(
				`Failed skill repository sync for '${scopeLabel}': ${error instanceof Error ? error.stack : error}`
			)
			throw error
		}
	}
}
