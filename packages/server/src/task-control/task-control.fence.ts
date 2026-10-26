// Checkpoint commits share the stable control lock with termination, including across threads.
import { EntityManager, In, Raw } from 'typeorm'
import { z } from 'zod'
import { ExecutionTaskControl } from './task-control.entity'
import { TaskControlRejected, TaskControlScope } from './task-control.store'

export async function assertTaskExecutionWritable(
	manager: EntityManager,
	scope: TaskControlScope,
	executionId: string
) {
	const where = {
		kind: 'execution' as const,
		attempts: Raw((alias) => `${alias} @> :attempt::jsonb`, { attempt: JSON.stringify([executionId]) })
	}
	const found = await manager.findOne(ExecutionTaskControl, { where })
	if (!found) return // Historical checkpoints have no inferred task ownership.
	await manager.findOneOrFail(ExecutionTaskControl, {
		where: { id: found.rootId },
		lock: { mode: 'pessimistic_write' }
	})
	const task = await manager.findOneByOrFail(ExecutionTaskControl, { id: found.id })
	const ancestors = z.array(z.string().uuid()).min(1).parse(task.ancestors)
	if (
		task.tenantId !== scope.tenantId ||
		task.organizationId !== (scope.organizationId ?? null) ||
		task.currentExecutionId !== executionId ||
		task.state === 'completed' ||
		ancestors[0] !== task.rootId ||
		ancestors[ancestors.length - 1] !== task.id
	)
		throw new TaskControlRejected('scope')
	const lineage = await manager.findBy(ExecutionTaskControl, { id: In(ancestors) })
	if (
		lineage.length !== ancestors.length ||
		lineage.some(
			(entry) =>
				entry.rootId !== task.rootId ||
				entry.tenantId !== task.tenantId ||
				entry.organizationId !== task.organizationId
		)
	)
		throw new TaskControlRejected('scope')
	if (lineage.some((entry) => entry.desired === 'terminated')) throw new TaskControlRejected('terminated')
}
