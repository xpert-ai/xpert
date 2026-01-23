import { validateRunCreateInput } from './run-create-stream.handler'

describe('validateRunCreateInput', () => {
	it('normalizes simple string payloads', () => {
		const result = validateRunCreateInput({ input: 'Tell me a joke.' })
		expect(result.input).toEqual({ input: 'Tell me a joke.' })
	})

	it('accepts already structured input', () => {
		const result = validateRunCreateInput({ input: { input: 'Hi' } })
		expect(result.input).toEqual({ input: 'Hi' })
	})

	it('rejects missing input', () => {
		expect(() => validateRunCreateInput({})).toThrow()
	})
})
