import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { runWithRequestContext } from '@xpert-ai/plugin-sdk'
import type { ManagedQueueExecutionPool, ManagedQueueJob } from '@xpert-ai/plugin-sdk'
import type { Job } from 'bullmq'
import { runWithRequestContext as runWithLegacyRequestContext } from '../core/context/request-context.middleware'
import { MANAGED_QUEUE_PHYSICAL_QUEUE_NAME, MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME } from './constants'
import type { ManagedQueueEnvelope } from './constants'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'

const MANAGED_QUEUE_WORKER_CONCURRENCY = normalizeConcurrency(process.env.MANAGED_QUEUE_CONCURRENCY, 10)

@Injectable()
@Processor(MANAGED_QUEUE_PHYSICAL_QUEUE_NAME, {
	concurrency: MANAGED_QUEUE_WORKER_CONCURRENCY,
	autorun: managedQueuePoolAutorun('default')
})
export class ManagedQueueProcessor extends WorkerHost {
	private readonly logger = new Logger(ManagedQueueProcessor.name)

	constructor(private readonly registry: ManagedQueueHandlerRegistryService) {
		super()
	}

	async process(job: Job<ManagedQueueEnvelope>): Promise<void> {
		return this.processForPool(job, 'default')
	}

	protected async processForPool(
		job: Job<ManagedQueueEnvelope>,
		executionPool: ManagedQueueExecutionPool
	): Promise<void> {
		const envelope = job.data
		if ((envelope.executionPool ?? 'default') !== executionPool) {
			throw new Error(`Managed queue job ${job.id} was delivered to the wrong execution pool`)
		}
		const handler = this.registry.resolve({
			pluginName: envelope.pluginName,
			queueName: envelope.queueName,
			jobName: envelope.jobName,
			scopeKey: envelope.scopeKey
		})
		if (!handler) {
			throw new Error(
				`No managed queue handler registered for ${envelope.pluginName}/${envelope.queueName}/${envelope.jobName}`
			)
		}

		const managedJob: ManagedQueueJob = {
			id: String(job.id),
			name: envelope.jobName,
			data: envelope.payload,
			attemptsMade: job.attemptsMade,
			opts: job.opts as Record<string, unknown>
		}

		await this.runWithJobContext(envelope, async () => {
			this.logger.debug(
				`Processing managed queue job ${managedJob.id} ${envelope.pluginName}/${envelope.queueName}/${envelope.jobName}`
			)
			await handler(managedJob)
		})
	}

	private async runWithJobContext<T>(envelope: ManagedQueueEnvelope, task: () => Promise<T>): Promise<T> {
		const tenantId = envelope.tenantId ?? undefined
		const organizationId = envelope.organizationId ?? undefined
		const user = tenantId
			? ({
					id: envelope.userId ?? null,
					tenantId
				} as any)
			: undefined
		const headers: Record<string, string> = {
			...(tenantId ? { ['tenant-id']: tenantId } : {}),
			...(organizationId ? { ['organization-id']: organizationId } : {}),
			['x-scope-level']: organizationId ? 'organization' : 'tenant'
		}

		return new Promise<T>((resolve, reject) => {
			runWithRequestContext({ user, headers } as any, {} as any, () => {
				runWithLegacyRequestContext({ user, headers } as any, () => {
					task().then(resolve).catch(reject)
				})
			})
		})
	}
}

const SANDBOX_BROWSER_WORKER_CONCURRENCY = normalizeConcurrency(
	process.env.MANAGED_QUEUE_SANDBOX_BROWSER_CONCURRENCY,
	5
)

/** Dedicated no-HTTP Worker consumer for browser-heavy Sandbox Job handlers. */
@Injectable()
@Processor(MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME, {
	concurrency: SANDBOX_BROWSER_WORKER_CONCURRENCY,
	autorun: managedQueuePoolAutorun('sandbox-browser')
})
export class SandboxBrowserManagedQueueProcessor extends ManagedQueueProcessor {
	constructor(registry: ManagedQueueHandlerRegistryService) {
		super(registry)
	}

	async process(job: Job<ManagedQueueEnvelope>): Promise<void> {
		return this.processForPool(job, 'sandbox-browser')
	}
}

function normalizeConcurrency(value: string | undefined, fallback: number): number {
	const parsed = Number(value)
	return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback
}

/**
 * Selects queue consumers from the process role so normal deployments do not
 * need separate autorun switches. Explicit legacy values remain supported for
 * tests and unusual deployments.
 */
export function managedQueuePoolAutorun(
	executionPool: ManagedQueueExecutionPool,
	environment: NodeJS.ProcessEnv = process.env
): boolean {
	const isBrowserWorker = environment.XPERT_PROCESS_ROLE === 'sandbox-browser-worker'
	if (executionPool === 'sandbox-browser') return isBrowserWorker
	if (isBrowserWorker) return false
	return optionalBoolean(environment.MANAGED_QUEUE_AUTORUN) ?? true
}

function optionalBoolean(value: string | undefined): boolean | undefined {
	const normalized = value?.trim().toLowerCase()
	if (normalized === 'true') return true
	if (normalized === 'false') return false
	return undefined
}
