import { z } from 'zod'
import type { ExecutionTaskControl } from './task-control.entity'
import type { TaskControlPublication } from './task-control-publication.entity'
import { readHandoffReceipt } from './handoff-receipt'

/** @deprecated #1413 recovery-only parser; remove with legacyHandoffOutcome after its retirement gates. */
const legacyTerminalResult = z.discriminatedUnion('status', [
	z.object({ status: z.literal('ok'), outbound: z.array(z.unknown()).optional() }).strict(),
	z.object({ status: z.literal('dead'), reason: z.string() }).strict()
])

export type HandoffRecoveryEvidence =
	| 'completed'
	| 'receipt'
	| 'legacy_returned'
	| 'never_admitted'
	| 'pending'
	| 'uncertain'
	| 'legacy_review'

/**
 * Legacy results preceded follow-up publication; require the worker's successful exit too.
 * @deprecated #1413 recovery-only compatibility. Remove after legacy workers retire,
 * unresolved legacy tasks are resolved or archived out of runtime, and recovery callers retire.
 * Removal gates: docs/operations/handoff-receipt-recovery.md.
 */
export function legacyHandoffOutcome(publication: TaskControlPublication, children: ExecutionTaskControl[]) {
	const workers = children.filter(
		(child) => child.kind === 'managed-queue' && child.parentId === publication.targetId
	)
	const parsed = legacyTerminalResult.safeParse(publication.result)
	if (
		!parsed.success ||
		workers.length !== 1 ||
		workers[0].outcome !== 'succeeded' ||
		!children.every((child) => child.state === 'completed' && !child.claim)
	)
		return null
	return parsed.data.status === 'ok' ? ('succeeded' as const) : ('failed' as const)
}

export function handoffRecoveryEvidence(
	task: ExecutionTaskControl,
	publication: TaskControlPublication,
	children: ExecutionTaskControl[]
): HandoffRecoveryEvidence {
	if (task.state === 'completed') return 'completed'
	const receipt = readHandoffReceipt(publication.result)
	if (receipt) return receipt.outcome === 'uncertain' ? 'uncertain' : 'receipt'
	if (!task.claim && legacyHandoffOutcome(publication, children)) return 'legacy_returned'
	if (task.claim || publication.result || children.some((child) => child.claim || child.state !== 'queued'))
		return 'uncertain'
	const payload = z.object({ receiptProtocol: z.literal(1) }).safeParse(publication.payload)
	// Keep unsupported-protocol isolation after legacy recovery retires; never infer safe execution from missing history.
	if (!payload.success) return 'legacy_review'
	return task.state === 'queued' && !children.length && !publication.publishedAt ? 'never_admitted' : 'pending'
}
