// V3 has a separate outbox AND physical queue: a v2 reconciler must never strip the handler contract.
import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { Processor } from '@nestjs/bullmq'
import { DelayedError, type Job } from 'bullmq'
import { z } from 'zod'
import {
	ControlRuntimeAdmissionService,
	TaskControlRunner,
	TaskControlStore,
	controlAdmissionUnavailable
} from '../task-control'
import { UserService } from '../user/user.service'
import { ManagedQueueHandlerRegistryService } from './managed-queue-handler-registry.service'
import {
	ManagedQueueProcessor,
	managedQueuePoolAutorun,
	MANAGED_QUEUE_WORKER_CONCURRENCY,
	SANDBOX_BROWSER_EXECUTOR_CONCURRENCY
} from './managed-queue.processor'
import {
	MANAGED_QUEUE_ADMITTED_NAME,
	MANAGED_QUEUE_ADMITTED_BROWSER_NAME,
	type ManagedQueueEnvelope
} from './constants'
import { parseControlledEnvelope } from './managed-queue.service'

export async function verifyAdmittedJob(store: TaskControlStore, job: Job<ManagedQueueEnvelope>) {
	const envelope = parseControlledEnvelope(job.data)
	if (envelope.controlProtocol !== 3 || !envelope.controlContract) throw controlAdmissionUnavailable('protocol')
	const publication = await store.publication(envelope.control.targetId)
	if (publication?.transport !== 'managed-queue-v3') throw controlAdmissionUnavailable('protocol')
	const saved = parseControlledEnvelope(z.object({ envelope: z.unknown() }).parse(publication.payload).envelope)
	if (saved.control.targetId !== envelope.control.targetId) throw controlAdmissionUnavailable('protocol')
	for (const field of [
		'pluginName',
		'queueName',
		'jobName',
		'scopeKey',
		'tenantId',
		'organizationId',
		'executionPool',
		'controlContract',
		'controlProtocol'
	] as const)
		if (saved[field] !== envelope[field]) throw controlAdmissionUnavailable('protocol')
	job.data = envelope
}

async function admit(
	store: TaskControlStore,
	admission: ControlRuntimeAdmissionService,
	job: Job<ManagedQueueEnvelope>
) {
	await verifyAdmittedJob(store, job)
	const target = await store.read(job.data.control.targetId)
	try {
		await admission.requireLocal('managedQueue', target?.drainOnPause === true)
	} catch (error) {
		if (!(error instanceof ServiceUnavailableException)) throw error
		await job.moveToDelayed(Date.now() + 1000, job.token)
		throw new DelayedError()
	}
}

@Injectable()
@Processor(MANAGED_QUEUE_ADMITTED_NAME, {
	concurrency: MANAGED_QUEUE_WORKER_CONCURRENCY,
	autorun: managedQueuePoolAutorun('default')
})
export class AdmittedManagedQueueProcessor extends ManagedQueueProcessor {
	constructor(
		registry: ManagedQueueHandlerRegistryService,
		userService: UserService,
		private readonly taskStore: TaskControlStore,
		runner: TaskControlRunner,
		private readonly admission: ControlRuntimeAdmissionService
	) {
		super(registry, userService, taskStore, runner)
	}
	async process(job: Job<ManagedQueueEnvelope>) {
		await admit(this.taskStore, this.admission, job)
		return this.processForPool(job, 'default')
	}
}

@Injectable()
@Processor(MANAGED_QUEUE_ADMITTED_BROWSER_NAME, {
	concurrency: SANDBOX_BROWSER_EXECUTOR_CONCURRENCY,
	autorun: managedQueuePoolAutorun('sandbox-browser')
})
export class AdmittedBrowserManagedQueueProcessor extends ManagedQueueProcessor {
	constructor(
		registry: ManagedQueueHandlerRegistryService,
		userService: UserService,
		private readonly taskStore: TaskControlStore,
		runner: TaskControlRunner,
		private readonly admission: ControlRuntimeAdmissionService
	) {
		super(registry, userService, taskStore, runner)
	}
	async process(job: Job<ManagedQueueEnvelope>) {
		await admit(this.taskStore, this.admission, job)
		return this.processForPool(job, 'sandbox-browser')
	}
}
