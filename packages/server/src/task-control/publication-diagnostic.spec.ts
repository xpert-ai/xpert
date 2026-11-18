import { z } from 'zod'
import { controlAdmissionUnavailable } from './control-schema'
import { publicationDiagnostic } from './publication-diagnostic'
import { TaskControlRejected } from './task-control.store'

describe('safe publication diagnostics', () => {
	it.each([
		['worker', true],
		['schema', true],
		['handler', false],
		['protocol', false]
	] as const)('classifies %s without retaining exception data', (code, retryable) => {
		expect(publicationDiagnostic(controlAdmissionUnavailable(code))).toMatchObject({ code, retryable })
	})
	it('uses allowlisted evidence for payload, scope and transport failures', () => {
		const invalid = z.string().safeParse({ secret: 'private' })
		if (invalid.success) throw new Error('Expected validation failure')
		expect(publicationDiagnostic(invalid.error)).toMatchObject({ code: 'payload', retryable: false })
		expect(publicationDiagnostic(new TaskControlRejected('scope'))).toMatchObject({
			code: 'scope',
			retryable: false
		})
		const diagnostic = publicationDiagnostic(new Error('credentials and provider response'))
		expect(diagnostic).toMatchObject({ code: 'transport', retryable: true })
		expect(JSON.stringify(diagnostic)).not.toContain('credentials')
	})
})
