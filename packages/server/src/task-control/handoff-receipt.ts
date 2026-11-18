import { z } from 'zod'
import type { HandoffTaskReceipt } from '@xpert-ai/contracts'

export const handoffReceiptSchema = z
	.object({
		version: z.literal(1),
		kind: z.literal('handoff-receipt'),
		workerId: z.string().uuid(),
		workerClaim: z.string().uuid(),
		outcome: z.enum(['succeeded', 'failed', 'uncertain']),
		result: z.unknown()
	})
	.strict()

export function readHandoffReceipt(value: unknown): HandoffTaskReceipt | null {
	const parsed = handoffReceiptSchema.safeParse(value)
	if (!parsed.success) return null
	return {
		version: parsed.data.version,
		kind: parsed.data.kind,
		workerId: parsed.data.workerId,
		workerClaim: parsed.data.workerClaim,
		outcome: parsed.data.outcome,
		result: parsed.data.result
	}
}
