import { ServiceUnavailableException } from '@nestjs/common'
import { TaskControlRejected } from './task-control.store'
import type { TaskPublicationDiagnostic } from '@xpert-ai/contracts'
import { z } from 'zod'

const admissionError = z.object({
	errorCode: z.literal('EXECUTION_CONTROL_UNAVAILABLE'),
	reason: z.enum(['schema', 'handler', 'worker', 'protocol'])
})

export function publicationDiagnostic(error: unknown): TaskPublicationDiagnostic {
	let code: TaskPublicationDiagnostic['code'] = 'transport'
	let retryable = true
	if (error instanceof ServiceUnavailableException) {
		const parsed = admissionError.safeParse(error.getResponse())
		if (parsed.success) {
			code = parsed.data.reason
			retryable = code === 'worker' || code === 'schema'
		}
	} else if (error instanceof TaskControlRejected) {
		code = 'scope'
		retryable = false
	} else if (error instanceof z.ZodError) {
		code = 'payload'
		retryable = false
	}
	return { code, retryable, recordedAt: new Date().toISOString() }
}
