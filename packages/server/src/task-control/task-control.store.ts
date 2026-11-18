// Invariants: lock the stable root before registering, claiming or changing intent.
// An expired worker lease is not evidence that its handler exited; claims never time out into replay.
// Only explicit paused receipts permit resumption. Detached/shared boundaries start new ancestry.
import { Injectable } from '@nestjs/common'
import { DataSource, EntityManager, In, IsNull, LessThanOrEqual, Raw } from 'typeorm'
import type { HandoffTaskReceipt, TaskPublicationDiagnostic } from '@xpert-ai/contracts'
import { readHandoffReceipt } from './handoff-receipt'
import { handoffRecoveryEvidence, legacyHandoffOutcome } from './handoff-recovery'
import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import type {
	TaskControlIntent,
	TaskControlKind,
	TaskControlPolicy,
	TaskControlRef,
	TaskControlState
} from '@xpert-ai/plugin-sdk'
import { ExecutionTaskControl } from './task-control.entity'
import { TaskControlPublication } from './task-control-publication.entity'
import { currentTaskControl, currentTaskExecution } from './task-control.context'

export type TaskControlScope = { tenantId: string; organizationId?: string | null }
export type RegisterControlledTask = TaskControlScope & {
	kind: TaskControlKind
	resourceId: string
	parent?: TaskControlRef
	policy?: TaskControlPolicy
	threadId?: string
	executionId?: string
	drainOnPause?: boolean
}
export class TaskControlRejected extends Error {
	constructor(readonly reason: 'terminated' | 'paused' | 'claimed' | 'scope' | 'missing') {
		super(`Task control: ${reason}`)
	}
}

@Injectable()
export class TaskControlStore {
	constructor(private readonly database: DataSource) {}

	async producer(): Promise<TaskControlRef | undefined> {
		const reference = currentTaskControl()
		const executionId = currentTaskExecution()
		if (!reference || !executionId) return reference
		const parent = await this.read(reference.targetId)
		const execution = await this.execution(executionId)
		if (!execution || !parent || execution.rootId !== parent.rootId || execution.currentExecutionId !== executionId)
			throw new TaskControlRejected('scope')
		return { version: 2, targetId: execution.id }
	}

	async register(input: RegisterControlledTask, manager?: EntityManager): Promise<ExecutionTaskControl> {
		if (!input.tenantId) throw new TaskControlRejected('scope')
		if (!manager) return this.database.transaction((tx) => this.register(input, tx))
		const id = taskControlId(input)
		const existing = await this.read(id, manager)
		let parent: ExecutionTaskControl | null = null
		if (input.parent) {
			parent = await this.lock(manager, input.parent.targetId)
			if (parent.tenantId !== input.tenantId || parent.organizationId !== (input.organizationId ?? null))
				throw new TaskControlRejected('scope')
			if (!existing && ((await this.intentOf(manager, parent)) === 'terminated' || parent.state === 'completed'))
				throw new TaskControlRejected('terminated')
		}
		const policy = input.policy ?? 'attached'
		const attached = parent && policy === 'attached'
		const ancestors = attached ? [...parent.ancestors, id] : [id]
		await manager
			.createQueryBuilder()
			.insert()
			.into(ExecutionTaskControl)
			.values({
				id,
				rootId: attached ? parent.rootId : id,
				parentId: parent?.id ?? null,
				tenantId: input.tenantId,
				organizationId: input.organizationId ?? null,
				kind: input.kind,
				resourceId: input.resourceId,
				policy,
				ancestors,
				threadId: input.threadId ?? null,
				currentExecutionId: input.executionId ?? null,
				attempts: input.executionId ? [input.executionId] : [],
				desired: 'running',
				revision: 1,
				state: 'queued',
				claim: null,
				drainOnPause: input.drainOnPause ?? false,
				nextCheckAt: new Date(),
				deliveryToken: null,
				deliveryUntil: null,
				observation: null,
				outcome: null
			})
			.orIgnore()
			.execute()
		const task = await this.lock(manager, id)
		if (
			task.rootId !== (attached ? parent.rootId : id) ||
			task.parentId !== (parent?.id ?? null) ||
			task.policy !== policy
		)
			throw new TaskControlRejected('scope')
		return task
	}

	async execution(executionId: string, manager = this.database.manager) {
		return this.validate(
			await manager
				.getRepository(ExecutionTaskControl)
				.createQueryBuilder('task')
				.where('task.attempts @> :attempt::jsonb', { attempt: JSON.stringify([executionId]) })
				.getOne()
		)
	}

	async read(id: string, manager = this.database.manager) {
		return this.validate(await manager.findOneBy(ExecutionTaskControl, { id }))
	}

	async find(scope: TaskControlScope, kind: TaskControlKind, resourceId: string, manager = this.database.manager) {
		return this.read(taskControlId({ ...scope, kind, resourceId }), manager)
	}

	async publish(input: RegisterControlledTask, payload: unknown, transport?: 'managed-queue-v3') {
		return this.database.transaction(async (manager) => {
			const task = await this.register(input, manager)
			payload = JSON.parse(JSON.stringify(payload))
			if (task.kind !== 'handoff' && task.kind !== 'managed-queue') throw new TaskControlRejected('scope')
			const previous = await manager.findOneBy(TaskControlPublication, { targetId: task.id })
			if (transport && task.kind !== 'managed-queue') throw new TaskControlRejected('scope')
			if (previous && previous.transport !== (transport ?? task.kind)) throw new TaskControlRejected('scope')
			if (previous && (previous.tenantId !== task.tenantId || previous.organizationId !== task.organizationId))
				throw new TaskControlRejected('scope')
			if (previous && !isDeepStrictEqual(previous.payload, payload)) throw new TaskControlRejected('scope')
			if (!previous)
				await manager.insert(TaskControlPublication, {
					tenantId: task.tenantId,
					organizationId: task.organizationId,
					targetId: task.id,
					transport: transport ?? task.kind,
					payload,
					result: null,
					nextAttemptAt: new Date(),
					publishedAt: null
				})
			return task
		})
	}

	async publications(transport: TaskControlPublication['transport']) {
		return this.database.getRepository(TaskControlPublication).find({
			where: {
				transport,
				publishedAt: IsNull(),
				nextAttemptAt: LessThanOrEqual(new Date()),
				diagnostic: Raw(
					(alias) => `(${alias} IS NULL OR jsonb_extract_path_text(${alias}, 'retryable') = 'true')`
				)
			},
			order: { nextAttemptAt: 'ASC' },
			take: 50
		})
	}

	publication(id: string) {
		return this.database.manager.findOneBy(TaskControlPublication, { targetId: id })
	}

	async publicationResult(id: string, result: unknown) {
		await this.database.getRepository(TaskControlPublication).update({ targetId: id, result: IsNull() }, { result })
	}

	async published(id: string, success: boolean, diagnostic?: TaskPublicationDiagnostic) {
		await this.database.getRepository(TaskControlPublication).update(
			{ targetId: id, publishedAt: IsNull() },
			success
				? { publishedAt: new Date(), diagnostic: null }
				: {
						nextAttemptAt: new Date(Date.now() + 5000),
						...(diagnostic ? { diagnostic } : {})
					}
		)
	}

	/** Bind callback admission to the actual worker claim, before any business side effects. */
	async startHandoff(id: string, workerId: string): Promise<string | null> {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			const worker = await this.read(workerId, manager)
			this.assertHandoffWorker(task, worker)
			if (task.state === 'completed') return null
			const publication = await manager.findOneByOrFail(TaskControlPublication, { targetId: id })
			this.assertHandoffPublication(task, publication)
			if (
				task.state !== 'queued' ||
				task.claim ||
				publication.result ||
				!worker.claim ||
				worker.state !== 'running'
			)
				throw new TaskControlRejected('claimed')
			const intent = await this.intentOf(manager, task)
			if (intent === 'terminated' || (intent === 'paused' && !task.drainOnPause))
				throw new TaskControlRejected(intent)
			task.claim = worker.claim
			task.state = 'running'
			await manager.save(task)
			return worker.claim
		})
	}

	/** Persist the handler return and its task receipt together, fenced by the original claim. */
	async recordHandoffReceipt(id: string, receipt: HandoffTaskReceipt) {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			this.assertHandoffWorker(task, await this.read(receipt.workerId, manager))
			const publication = await manager.findOneByOrFail(TaskControlPublication, { targetId: id })
			this.assertHandoffPublication(task, publication)
			if (publication.result) {
				if (!isDeepStrictEqual(publication.result, JSON.parse(JSON.stringify(receipt))))
					throw new TaskControlRejected('scope')
				return
			}
			if (task.claim !== receipt.workerClaim || task.state === 'completed')
				throw new TaskControlRejected('claimed')
			publication.result = receipt
			await manager.save(publication)
			await this.applyHandoffReceipt(task, receipt, manager)
		})
	}

	/** Worker completion alone is insufficient: retries and uncertain callback outcomes stay pending. */
	async settleHandoffReceipt(id: string) {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			if (task.kind !== 'handoff') throw new TaskControlRejected('scope')
			if (task.state === 'completed') return true
			const publication = await manager.findOneBy(TaskControlPublication, { targetId: id })
			if (publication) this.assertHandoffPublication(task, publication)
			const receipt = readHandoffReceipt(publication?.result)
			if (!receipt || receipt.outcome === 'uncertain' || task.claim !== receipt.workerClaim) return false
			this.assertHandoffWorker(task, await this.read(receipt.workerId, manager))
			await this.applyHandoffReceipt(task, receipt, manager)
			return true
		})
	}

	private assertHandoffWorker(task: ExecutionTaskControl, worker: ExecutionTaskControl | null) {
		if (
			task.kind !== 'handoff' ||
			!worker ||
			worker.kind !== 'managed-queue' ||
			worker.parentId !== task.id ||
			worker.rootId !== task.rootId ||
			worker.tenantId !== task.tenantId ||
			worker.organizationId !== task.organizationId
		)
			throw new TaskControlRejected('scope')
	}

	private assertHandoffPublication(task: ExecutionTaskControl, publication: TaskControlPublication) {
		if (
			publication.transport !== 'handoff' ||
			publication.tenantId !== task.tenantId ||
			publication.organizationId !== task.organizationId
		)
			throw new TaskControlRejected('scope')
	}

	private async applyHandoffReceipt(task: ExecutionTaskControl, receipt: HandoffTaskReceipt, manager: EntityManager) {
		task.state = receipt.outcome === 'uncertain' ? 'unknown' : 'completed'
		task.outcome = receipt.outcome === 'uncertain' ? null : receipt.outcome
		if (task.state === 'completed') task.claim = null
		task.nextCheckAt = new Date(Date.now() + 1000)
		await manager.save(task)
	}

	/** Trusted maintenance caller supplies exact scope; reports contain no callback payload or credentials. */
	async inspectHandoff(scope: TaskControlScope, id: string) {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			this.assertHandoffScope(task, scope)
			const publication = await manager.findOneByOrFail(TaskControlPublication, { targetId: id })
			this.assertHandoffPublication(task, publication)
			const children = (await this.descendants(id, manager)).filter((child) => child.id !== id)
			return {
				targetId: id,
				revision: task.revision,
				state: task.state,
				outcome: task.outcome,
				evidence: handoffRecoveryEvidence(task, publication, children),
				diagnostic: publication.diagnostic,
				workers: children
					.filter((child) => child.parentId === id && child.kind === 'managed-queue')
					.map((child) => ({ id: child.id, state: child.state, outcome: child.outcome }))
			}
		})
	}

	/**
	 * Repairs one legacy handler return with a successful worker exit; never dispatches work.
	 * @deprecated #1413 historical repair only. Remove after legacy workers retire,
	 * legacy tasks are resolved or archived out of runtime, and the repair window and callers retire.
	 * Removal gates: docs/operations/handoff-receipt-recovery.md.
	 */
	async recoverLegacyHandoffReceipt(scope: TaskControlScope, id: string, revision: number) {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			this.assertHandoffScope(task, scope)
			if (task.revision !== revision || task.claim) throw new TaskControlRejected('claimed')
			if (task.state === 'completed') return false
			const publication = await manager.findOneByOrFail(TaskControlPublication, { targetId: id })
			this.assertHandoffPublication(task, publication)
			const children = (await this.descendants(id, manager)).filter((child) => child.id !== id)
			const outcome = legacyHandoffOutcome(publication, children)
			if (!outcome) return false
			task.state = 'completed'
			task.outcome = outcome
			task.revision++
			publication.diagnostic = {
				code: 'receipt_recovered',
				retryable: false,
				recordedAt: new Date().toISOString()
			}
			await manager.save(publication)
			await manager.save(task)
			return true
		})
	}

	private assertHandoffScope(task: ExecutionTaskControl, scope: TaskControlScope) {
		if (
			task.kind !== 'handoff' ||
			task.tenantId !== scope.tenantId ||
			task.organizationId !== (scope.organizationId ?? null)
		)
			throw new TaskControlRejected('scope')
	}

	async desired(id: string, manager = this.database.manager): Promise<TaskControlIntent> {
		const task = await this.read(id, manager)
		if (!task) throw new TaskControlRejected('missing')
		return this.intentOf(manager, task)
	}

	async change(id: string, desired: TaskControlIntent, manager?: EntityManager) {
		if (!manager) return this.database.transaction((tx) => this.change(id, desired, tx))
		const task = await this.lock(manager, id)
		if (task.desired === 'terminated' && desired !== 'terminated') throw new TaskControlRejected('terminated')
		if (task.desired !== desired) {
			task.desired = desired
			task.revision++
			task.nextCheckAt = new Date()
			await manager.save(task)
			await manager
				.getRepository(ExecutionTaskControl)
				.createQueryBuilder()
				.update()
				.set({ nextCheckAt: new Date() })
				.where('ancestors @> :ancestor::jsonb', { ancestor: JSON.stringify([id]) })
				.execute()
		}
	}

	async bind(executionId: string, nextExecutionId: string, manager: EntityManager) {
		const previous = await this.execution(executionId, manager)
		if (!previous) return
		const task = await this.lock(manager, previous.id)
		if (task.currentExecutionId !== executionId || (await this.intentOf(manager, task)) !== 'running')
			throw new TaskControlRejected('terminated')
		task.currentExecutionId = nextExecutionId
		if (!task.attempts.includes(nextExecutionId)) task.attempts.push(nextExecutionId)
		task.state = 'running'
		task.revision++
		task.nextCheckAt = new Date()
		await manager.save(task)
	}

	/** A failed resume may return to the same checkpoint, but cannot erase a termination. */
	async restoreAttempt(currentId: string, previousId: string, manager: EntityManager) {
		const found = await this.execution(currentId, manager)
		if (!found) return
		const task = await this.lock(manager, found.id)
		if (task.currentExecutionId !== currentId || !task.attempts.includes(previousId))
			throw new TaskControlRejected('scope')
		if ((await this.intentOf(manager, task)) === 'terminated') throw new TaskControlRejected('terminated')
		task.currentExecutionId = previousId
		task.desired = 'paused'
		task.state = 'paused'
		task.revision++
		await manager.save(task)
	}

	async assertAncestorsRunning(id: string, manager: EntityManager) {
		const task = await this.lock(manager, id)
		const ancestors = await manager.findBy(ExecutionTaskControl, {
			id: In(task.ancestors.filter((ancestor) => ancestor !== id))
		})
		if (ancestors.some((ancestor) => ancestor.desired === 'terminated')) throw new TaskControlRejected('terminated')
		if (ancestors.some((ancestor) => ancestor.desired === 'paused')) throw new TaskControlRejected('paused')
	}

	async claim(id: string, manager?: EntityManager): Promise<string> {
		if (!manager) return this.database.transaction((tx) => this.claim(id, tx))
		const task = await this.lock(manager, id)
		const intent = await this.intentOf(manager, task)
		if (intent === 'terminated' || task.state === 'completed') throw new TaskControlRejected('terminated')
		if (intent === 'paused' && !task.drainOnPause) throw new TaskControlRejected('paused')
		if (task.claim) throw new TaskControlRejected('claimed')
		task.claim = randomUUID()
		task.state = 'running'
		task.nextCheckAt = new Date()
		await manager.save(task)
		return task.claim
	}

	/** Reserve only the local continuation CAS under the root lock, never a provider/network call. */
	async admitContinuation<T>(id: string, reserve: () => Promise<T>) {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			const intent = await this.intentOf(manager, task)
			if (intent !== 'running' || task.state === 'completed')
				throw new TaskControlRejected(intent === 'paused' ? 'paused' : 'terminated')
			return reserve()
		})
	}

	async receipt(id: string, state: TaskControlState, claim?: string, manager?: EntityManager) {
		if (!manager) return this.database.transaction((tx) => this.receipt(id, state, claim, tx))
		const task = await this.lock(manager, id)
		if (claim && task.claim !== claim) return
		if (task.state === 'completed') return
		if (state === 'paused' && (await this.intentOf(manager, task)) === 'terminated') return
		task.state = state
		if (state === 'paused' || state === 'completed') task.claim = null
		task.nextCheckAt = new Date(Date.now() + 1000)
		await manager.save(task)
	}

	/** Recheck under the same lock used by worker admission; a scan snapshot is not a receipt. */
	async settleUnstarted(id: string) {
		return this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			if (task.state !== 'queued' || task.claim || (await this.intentOf(manager, task)) !== 'terminated')
				return false
			if (task.kind === 'handoff') {
				const publication = await manager.findOneBy(TaskControlPublication, { targetId: id })
				// Keep this evidence guard after legacy recovery retires: old queued records may have unrecorded effects.
				// Cancellation cannot infer that an unsupported publication never executed.
				if (
					!z.object({ receiptProtocol: z.literal(1) }).safeParse(publication?.payload).success ||
					publication.result
				)
					return false
				const children = (await this.descendants(id, manager)).filter((child) => child.id !== id)
				if (
					children.some(
						(child) => child.claim || child.outcome || !['queued', 'completed'].includes(child.state)
					)
				)
					return false
			}
			await this.receipt(id, 'completed', undefined, manager)
			// Deprecated raw-result encoding (#1413): migrate this cancellation writer and its waiter together.
			// Retirement must preserve cancellation results without fabricating a worker/callback receipt.
			if (task.kind === 'handoff')
				await manager.update(
					TaskControlPublication,
					{ targetId: id, result: IsNull() },
					{ result: { status: 'dead', reason: 'Canceled before dispatch' } }
				)
			return true
		})
	}

	async finishClaim(id: string, claim: string, outcome: 'succeeded' | 'failed') {
		await this.database.transaction(async (manager) => {
			const task = await this.lock(manager, id)
			if (task.claim !== claim || task.state === 'completed') return
			task.state = 'completed'
			task.claim = null
			task.outcome = outcome
			await manager.save(task)
		})
	}

	async descendants(id: string, manager = this.database.manager) {
		const targets = await manager
			.getRepository(ExecutionTaskControl)
			.createQueryBuilder('task')
			.where('task.ancestors @> :ancestor::jsonb', { ancestor: JSON.stringify([id]) })
			.getMany()
		return targets.map((target) => this.validate(target))
	}

	async settled(id: string, pause: boolean, manager = this.database.manager) {
		const targets = await this.descendants(id, manager)
		return targets
			.filter((task) => task.id !== id)
			.every(
				(task) =>
					task.state === 'completed' ||
					(pause &&
						(task.state === 'paused' || (task.state === 'queued' && !task.claim && !task.drainOnPause)))
			)
	}

	async due(kinds: TaskControlKind[]) {
		return this.database.getRepository(ExecutionTaskControl).find({
			where: {
				kind: In(kinds),
				state: In(['queued', 'running', 'paused', 'unknown']),
				nextCheckAt: LessThanOrEqual(new Date())
			},
			order: { nextCheckAt: 'ASC', id: 'ASC' },
			take: 50
		})
	}

	async delivery(id: string) {
		const token = randomUUID()
		const result = await this.database
			.getRepository(ExecutionTaskControl)
			.createQueryBuilder()
			.update()
			.set({ deliveryToken: token, deliveryUntil: new Date(Date.now() + 30000) })
			.where({ id })
			.andWhere('("deliveryUntil" IS NULL OR "deliveryUntil" < now())')
			.execute()
		return result.affected ? token : null
	}

	async delivered(id: string, token: string, observation: string | null, delay = 1000) {
		await this.database.getRepository(ExecutionTaskControl).update(
			{ id, deliveryToken: token },
			{
				deliveryToken: null,
				deliveryUntil: null,
				observation,
				nextCheckAt: new Date(Date.now() + delay)
			}
		)
	}

	private async intentOf(manager: EntityManager, task: ExecutionTaskControl): Promise<TaskControlIntent> {
		const ancestors = await manager.findBy(ExecutionTaskControl, { id: In(task.ancestors) })
		if (ancestors.length !== task.ancestors.length) throw new TaskControlRejected('missing')
		if (
			ancestors.some(
				(ancestor) =>
					ancestor.rootId !== task.rootId ||
					ancestor.tenantId !== task.tenantId ||
					ancestor.organizationId !== task.organizationId
			)
		)
			throw new TaskControlRejected('scope')
		if (ancestors.some((ancestor) => ancestor.desired === 'terminated')) return 'terminated'
		return ancestors.some((ancestor) => ancestor.desired === 'paused') ? 'paused' : 'running'
	}

	private async lock(manager: EntityManager, id: string) {
		const found = await this.read(id, manager)
		if (!found) throw new TaskControlRejected('missing')
		await manager.findOneOrFail(ExecutionTaskControl, {
			where: { id: found.rootId },
			lock: { mode: 'pessimistic_write' }
		})
		return this.validate(await manager.findOneByOrFail(ExecutionTaskControl, { id }))
	}

	private validate(task: ExecutionTaskControl | null) {
		if (!task) return task
		if (!task.tenantId) throw new TaskControlRejected('scope')
		task.ancestors = z.array(z.string().uuid()).min(1).parse(task.ancestors)
		task.attempts = z.array(z.string()).parse(task.attempts)
		if (
			task.ancestors[0] !== task.rootId ||
			task.ancestors[task.ancestors.length - 1] !== task.id ||
			new Set(task.ancestors).size !== task.ancestors.length
		)
			throw new TaskControlRejected('scope')
		return task
	}
}

export function taskControlId(input: TaskControlScope & { kind: TaskControlKind; resourceId: string }) {
	const hex = createHash('sha256')
		.update(JSON.stringify([input.tenantId, input.organizationId ?? null, input.kind, input.resourceId]))
		.digest('hex')
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}
