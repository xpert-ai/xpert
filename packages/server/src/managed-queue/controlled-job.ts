// A transport redelivery cannot prove that an earlier handler exited.
// Keep the durable claim on ambiguous failure; only the real handler's return settles it.
import { DelayedError, UnrecoverableError, Job } from 'bullmq'
import { TaskControlRunner } from '../task-control/task-control.runner'
import { TaskControlStore, TaskControlRejected } from '../task-control/task-control.store'
import type { TaskControlContext, ManagedQueueExecutionPool } from '@xpert-ai/plugin-sdk'
import type { ManagedQueueEnvelope } from './constants'

export async function runControlledJob(
	store: TaskControlStore,
	runner: TaskControlRunner,
	job: Job<ManagedQueueEnvelope>,
	pool: ManagedQueueExecutionPool,
	handler: (control: TaskControlContext) => Promise<void>
) {
	const { control, tenantId, organizationId } = job.data
	if (control?.version !== 2) throw new Error('Unsupported controlled queue protocol')
	const target = await store.read(control.targetId)
	if (
		!target ||
		target.tenantId !== tenantId ||
		target.organizationId !== (organizationId ?? null) ||
		target.kind !== 'managed-queue' ||
		target.resourceId !== `${pool}/${job.id}`
	)
		throw new Error('Queue control scope mismatch')
	try {
		await runner.run(control, handler)
	} catch (error) {
		if (!(error instanceof TaskControlRejected)) throw error
		const current = await store.read(target.id)
		if (current.state === 'completed') {
			if (current.outcome === 'failed')
				throw new UnrecoverableError('The original handler failed; automatic replay withheld')
			return
		}
		if (error.reason === 'terminated' && !current.claim) {
			await store.receipt(target.id, 'completed')
			return
		}
		if (error.reason === 'paused' || error.reason === 'claimed' || error.reason === 'terminated') {
			await job.moveToDelayed(Date.now() + (error.reason === 'paused' ? 5000 : 30000), job.token)
			throw new DelayedError()
		}
		throw error
	}
}
