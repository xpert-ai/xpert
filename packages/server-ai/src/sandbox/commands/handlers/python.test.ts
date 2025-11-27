import { runPythonFunction } from './python'

describe('runPythonFunction', () => {

	beforeEach(() => {
		//
	})

	it('wraps inputs and code and returns parsed result and logs', async () => {

		const inputs = { a: 1, b: 2 }
		const code = 'print(a)\nreturn a + b'

		const response = await runPythonFunction(inputs, code)

		expect(response).toEqual({
			result: 3,
			logs: '1',
		})
	})

	it('joins multiple log lines', async () => {

		const code = 'print("first")\nprint("second")\nreturn {"ok": True}'
		const response = await runPythonFunction({ foo: 'bar' }, code)

		expect(response.logs).toBe('first\nsecond')
		expect(response.result).toEqual({ ok: true })
	})

	it('input null value error', async () => {

		const code = 'print("first")\nprint("second")\nreturn {"ok": True}'
		const response = await runPythonFunction({ foo: null }, code)

		expect(response.logs).toBe('first\nsecond')
		expect(response.result).toEqual({ ok: true })
	})
})
