import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Job, Queue } from 'bull'
import { OrganizationCreatedEvent, EVENT_ORGANIZATION_CREATED } from '@metad/server-core'
import { EVENT_USER_ORGANIZATION_CREATED, UserOrganizationCreatedEvent } from '@metad/server-core'
import {
	AI_BOOTSTRAP_QUEUE,
	AI_ORGANIZATION_BOOTSTRAP_JOB,
	AI_USER_ORGANIZATION_BOOTSTRAP_JOB
} from './constants'
import { ServerAIBootstrapService } from './bootstrap.service'

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
}
