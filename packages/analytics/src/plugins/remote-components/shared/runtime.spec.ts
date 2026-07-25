import { readRemoteDebugOverride } from './runtime'

describe('readRemoteDebugOverride', () => {
	it('returns null when opaque-origin storage access throws', () => {
		expect(
			readRemoteDebugOverride('datax-semantic-modeling', () => {
				throw new Error('SecurityError')
			})
		).toBeNull()
	})

	it('preserves explicit debug overrides when storage is available', () => {
		expect(readRemoteDebugOverride('datax-semantic-modeling', () => '0')).toBe('0')
		expect(readRemoteDebugOverride('datax-semantic-modeling', () => '1')).toBe('1')
	})
})
