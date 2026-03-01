import { buildCanceledReason, isAbortLikeError, isCanceledReason } from './cancel-reason'

describe('cancel-reason', () => {
	it('builds canceled reason with prefix', () => {
		expect(buildCanceledReason('Manual stop')).toBe('canceled:Manual stop')
		expect(buildCanceledReason()).toBe('canceled:Canceled by user')
	})

	it('detects canceled reason', () => {
		expect(isCanceledReason('canceled:Manual stop')).toBeTruthy()
		expect(isCanceledReason('dead:Manual stop')).toBeFalsy()
	})

	it('detects abort-like errors', () => {
		expect(isAbortLikeError(new Error('This operation was aborted'))).toBeTruthy()
		expect(isAbortLikeError('request canceled')).toBeTruthy()
		expect(isAbortLikeError(new Error('boom'))).toBeFalsy()
	})
})
