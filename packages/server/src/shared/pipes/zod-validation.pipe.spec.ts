import { BadRequestException } from '@nestjs/common'
import { z } from 'zod/v3'
import { ZodValidationPipe } from './zod-validation.pipe'

describe('ZodValidationPipe', () => {
	const schema = z
		.object({ take: z.coerce.number().int().min(1).max(100).default(20), model: z.string().trim().optional() })
		.strict()
	const invalid = jest.fn(() => new BadRequestException('invalid-query'))
	const pipe = new ZodValidationPipe(schema, invalid)

	beforeEach(() => invalid.mockClear())

	it('returns the parsed output with coercion/defaults without mutating the request', async () => {
		const input = { take: '10', model: ' model ' }
		const output = await pipe.transform(input)
		const take: number = output.take
		expect(take).toBe(10)
		expect(output.model).toBe('model')
		expect(input).toEqual({ take: '10', model: ' model ' })
		expect(await pipe.transform({})).toEqual({ take: 20 })
		expect(invalid).not.toHaveBeenCalled()
	})

	it.each([{ take: 101 }, { take: 'invalid' }, { take: ['1', '2'] }, { tenantId: 'untrusted' }])(
		'uses the supplied exception factory only for invalid input: %j',
		async (input) => {
			await expect(pipe.transform(input)).rejects.toThrow('invalid-query')
			expect(invalid).toHaveBeenCalledTimes(1)
			expect(invalid).toHaveBeenCalledWith(expect.any(z.ZodError))
		}
	)

	it('supports async refinements and transforms', async () => {
		const asyncSchema = z
			.string()
			.refine(async (value) => value === 'valid')
			.transform(async () => 42)
		const asyncPipe = new ZodValidationPipe(asyncSchema, invalid)
		expect(await asyncPipe.transform('valid')).toBe(42)
		await expect(asyncPipe.transform('invalid')).rejects.toThrow('invalid-query')
	})

	it('does not mask an unexpected parser failure as a client error', async () => {
		const error = new Error('unexpected transform failure')
		const failing = new ZodValidationPipe(
			z.string().transform(() => {
				throw error
			}),
			invalid
		)
		await expect(failing.transform('valid')).rejects.toBe(error)
		expect(invalid).not.toHaveBeenCalled()
	})
})
