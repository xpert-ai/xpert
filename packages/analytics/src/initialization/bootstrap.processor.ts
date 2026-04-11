import { OrganizationCreatedEvent, EVENT_ORGANIZATION_CREATED } from '@xpert-ai/server-core'
import { InjectQueue, Process, Processor } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { Job, Queue } from 'bull'
import { ANALYTICS_BOOTSTRAP_QUEUE, ANALYTICS_ORGANIZATION_BOOTSTRAP_JOB } from './constants'
import { AnalyticsBootstrapService } from './bootstrap.service'

@Processor(ANALYTICS_BOOTSTRAP_QUEUE)
export class AnalyticsBootstrapProcessor {
	private readonly logger = new Logger(AnalyticsBootstrapProcessor.name)

	constructor(
		@InjectQueue(ANALYTICS_BOOTSTRAP_QUEUE)
		private readonly bootstrapQueue: Queue,
		private readonly bootstrapService: AnalyticsBootstrapService
	) {}

	@OnEvent(EVENT_ORGANIZATION_CREATED)
	async enqueueOrganizationBootstrap(event: OrganizationCreatedEvent) {
		await this.bootstrapQueue.add(ANALYTICS_ORGANIZATION_BOOTSTRAP_JOB, event, {
			jobId: `org-bootstrap:${event.organizationId}`,
			attempts: 3,
			backoff: 10_000,
			removeOnComplete: true
		})
	}

	@Process(ANALYTICS_ORGANIZATION_BOOTSTRAP_JOB)
	async handleOrganizationBootstrap(job: Job<OrganizationCreatedEvent>) {
		try {
			await this.bootstrapService.bootstrapOrganization(job.data)
		} catch (error) {
			this.logger.error(
				`Failed analytics bootstrap for '${job.data.organizationId}': ${error instanceof Error ? error.stack : error}`
			)
			throw error
		}
	}
}
