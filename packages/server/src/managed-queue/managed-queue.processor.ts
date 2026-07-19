import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { IApiKey, IApiPrincipal, IUser } from '@xpert-ai/contracts'
import { runWithRequestContext } from '@xpert-ai/plugin-sdk'
import type { ManagedQueueExecutionPool, ManagedQueueJob, ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import type { Job } from 'bullmq'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { runWithRequestContext as runWithLegacyRequestContext } from '../core/context/request-context.middleware'
import { UserService } from '../user/user.service'
import { MANAGED_QUEUE_PHYSICAL_QUEUE_NAME, MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME } from './constants'
import type {
	ManagedQueueActorSnapshot,
	ManagedQueueDelegationSnapshot,
	ManagedQueueEnvelope,
	ManagedQueuePrincipalSnapshot
} from './constants'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'

const MANAGED_QUEUE_WORKER_CONCURRENCY = normalizeConcurrency(process.env.MANAGED_QUEUE_CONCURRENCY, 10)
const MANAGED_QUEUE_DELEGATED_API_KEY_TOKEN = '[managed-queue-delegation]'

@Injectable()
@Processor(MANAGED_QUEUE_PHYSICAL_QUEUE_NAME, {
	concurrency: MANAGED_QUEUE_WORKER_CONCURRENCY,
	autorun: managedQueuePoolAutorun('default')
})
export class ManagedQueueProcessor extends WorkerHost {
	private readonly logger = new Logger(ManagedQueueProcessor.name)

	constructor(
		private readonly registry: ManagedQueueHandlerRegistryService,
		private readonly userService: UserService
	) {
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
		const jobContext: ManagedQueueJobContext = {
			pluginName: envelope.pluginName,
			queueName: envelope.queueName,
			jobName: envelope.jobName,
			scopeKey: envelope.scopeKey ?? null,
			tenantId: envelope.tenantId ?? null,
			organizationId: envelope.organizationId ?? null,
			userId: envelope.actor?.userId ?? envelope.userId ?? envelope.principal?.id ?? null
		}

		await this.runWithJobContext(envelope, async () => {
			this.logger.debug(
				`Processing managed queue job ${managedJob.id} ${envelope.pluginName}/${envelope.queueName}/${envelope.jobName}`
			)
			await handler(managedJob, jobContext)
		})
	}

	private async runWithJobContext<T>(envelope: ManagedQueueEnvelope, task: () => Promise<T>): Promise<T> {
		const tenantId = envelope.tenantId ?? undefined
		const organizationId = envelope.organizationId ?? undefined
		const user = await this.resolveJobUser(envelope, tenantId, organizationId)
		const headers: Record<string, string> = {
			...(tenantId ? { ['tenant-id']: tenantId } : {}),
			...(organizationId ? { ['organization-id']: organizationId } : {}),
			['x-scope-level']: organizationId ? 'organization' : 'tenant'
		}
		const request: Partial<IncomingMessage> & { user?: IUser } = { user, headers }
		const response: Partial<ServerResponse> = {}

		return new Promise<T>((resolve, reject) => {
			runWithRequestContext(request, response, () => {
				runWithLegacyRequestContext(request, () => {
					task().then(resolve).catch(reject)
				})
			})
		})
	}

	private async resolveJobUser(
		envelope: ManagedQueueEnvelope,
		tenantId: string | undefined,
		organizationId: string | undefined
	): Promise<IUser | undefined> {
		if (envelope.actor) {
			const actor = await this.restoreActor(envelope.actor, tenantId, organizationId)
			return envelope.delegation
				? this.attachDelegation(actor, envelope.delegation, tenantId, organizationId)
				: actor
		}

		// Compatibility for jobs created before actor and delegation were split.
		if (envelope.principal) {
			const actor =
				envelope.principal.id && tenantId ? await this.loadActor(envelope.principal.id, tenantId) : undefined
			return this.restorePrincipal(envelope.principal, actor, tenantId, organizationId)
		}
		if (tenantId && envelope.userId) {
			return this.loadActor(envelope.userId, tenantId)
		}
		return undefined
	}

	private async restoreActor(
		snapshot: ManagedQueueActorSnapshot,
		tenantId: string | undefined,
		organizationId: string | undefined
	): Promise<IUser> {
		if (!tenantId || snapshot.tenantId !== tenantId) {
			throw new Error('Managed queue actor tenant does not match the job envelope')
		}
		if (organizationId && snapshot.organizationId !== organizationId) {
			throw new Error('Managed queue actor organization does not match the job envelope')
		}
		return this.loadActor(snapshot.userId, tenantId)
	}

	private loadActor(userId: string, tenantId: string): Promise<IUser> {
		return this.userService.findOneByIdWithinTenant(userId, tenantId, {
			relations: ['role', 'role.rolePermissions', 'employee']
		})
	}

	private attachDelegation(
		actor: IUser,
		snapshot: ManagedQueueDelegationSnapshot,
		tenantId: string | undefined,
		organizationId: string | undefined
	): IApiPrincipal {
		const delegatedTenantId = this.validateDelegation(snapshot, tenantId, organizationId)
		return this.buildDelegatedActor(actor, snapshot, delegatedTenantId)
	}

	private restorePrincipal(
		snapshot: ManagedQueuePrincipalSnapshot,
		actor: IUser | undefined,
		tenantId: string | undefined,
		organizationId: string | undefined
	): IApiPrincipal {
		const delegatedTenantId = this.validateDelegation(snapshot, tenantId, organizationId)
		const legacyActor: IUser = actor ?? {
			...(snapshot.id ? { id: snapshot.id } : {}),
			tenantId: delegatedTenantId
		}
		return this.buildDelegatedActor(legacyActor, snapshot, delegatedTenantId)
	}

	private validateDelegation(
		snapshot: ManagedQueueDelegationSnapshot,
		tenantId: string | undefined,
		organizationId: string | undefined
	): string {
		if (!tenantId || snapshot.tenantId !== tenantId) {
			throw new Error('Managed queue delegation tenant does not match the job envelope')
		}
		if (organizationId && snapshot.organizationId && snapshot.organizationId !== organizationId) {
			throw new Error('Managed queue delegation organization does not match the job envelope')
		}
		return tenantId
	}

	private buildDelegatedActor(
		actor: IUser,
		snapshot: ManagedQueueDelegationSnapshot,
		tenantId: string
	): IApiPrincipal {
		const apiKey: IApiKey = {
			token: MANAGED_QUEUE_DELEGATED_API_KEY_TOKEN,
			tenantId: snapshot.apiKey.tenantId,
			...(snapshot.apiKey.type ? { type: snapshot.apiKey.type } : {}),
			...(snapshot.apiKey.entityId ? { entityId: snapshot.apiKey.entityId } : {}),
			...(snapshot.apiKey.organizationId ? { organizationId: snapshot.apiKey.organizationId } : {}),
			...(snapshot.apiKey.userId ? { userId: snapshot.apiKey.userId } : {})
		}

		return {
			...actor,
			tenantId,
			principalType: snapshot.principalType,
			apiKey,
			ownerUserId: snapshot.ownerUserId ?? null,
			apiKeyUserId: snapshot.apiKeyUserId ?? null,
			requestedUserId: snapshot.requestedUserId ?? null,
			requestedOrganizationId: snapshot.requestedOrganizationId ?? null,
			clientSecretBindingType: snapshot.clientSecretBindingType ?? null,
			clientSecretId: snapshot.clientSecretId ?? null
		}
	}
}

const SANDBOX_BROWSER_EXECUTOR_CONCURRENCY = normalizeConcurrency(
	process.env.MANAGED_QUEUE_SANDBOX_BROWSER_CONCURRENCY,
	1
)

/** Browser-heavy API-local consumer, isolated in its own pool with a conservative default concurrency. */
@Injectable()
@Processor(MANAGED_QUEUE_SANDBOX_BROWSER_QUEUE_NAME, {
	concurrency: SANDBOX_BROWSER_EXECUTOR_CONCURRENCY,
	autorun: managedQueuePoolAutorun('sandbox-browser')
})
export class SandboxBrowserManagedQueueProcessor extends ManagedQueueProcessor {
	constructor(registry: ManagedQueueHandlerRegistryService, userService: UserService) {
		super(registry, userService)
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
 * Enables both logical execution pools in the API process by default.
 * The existing global override remains available for tests and maintenance.
 */
export function managedQueuePoolAutorun(
	_executionPool: ManagedQueueExecutionPool,
	environment: NodeJS.ProcessEnv = process.env
): boolean {
	return optionalBoolean(environment.MANAGED_QUEUE_AUTORUN) ?? true
}

function optionalBoolean(value: string | undefined): boolean | undefined {
	const normalized = value?.trim().toLowerCase()
	if (normalized === 'true') return true
	if (normalized === 'false') return false
	return undefined
}
