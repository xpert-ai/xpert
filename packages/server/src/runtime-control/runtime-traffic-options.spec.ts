import { readRuntimeTrafficOptions } from './runtime-traffic-options'

describe('runtime traffic configuration', () => {
	it('defaults to the shipped ingress propagation budget', () => {
		expect(readRuntimeTrafficOptions({})).toEqual({ withdrawalMs: 5_000 })
	})
	it.each(['5000', '9000', '60000'])('accepts bounded integer milliseconds: %s', (value) => {
		expect(readRuntimeTrafficOptions({ RUNTIME_TRAFFIC_WITHDRAWAL_MS: value })).toEqual({
			withdrawalMs: Number(value)
		})
	})
	it.each(['', '0', '-1', '4999', '60001', 'NaN', 'Infinity', '9000ms', '5000.5', '1e4'])(
		'rejects invalid or unsafe budgets: %s',
		(value) => {
			expect(() => readRuntimeTrafficOptions({ RUNTIME_TRAFFIC_WITHDRAWAL_MS: value })).toThrow()
		}
	)
})
