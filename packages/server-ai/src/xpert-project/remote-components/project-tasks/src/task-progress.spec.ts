import { nodeSchema } from './bridge'

describe('task progress presentation contract', () => {
    it('preserves measured zero and unknown values and rejects invalid bridge data', () => {
        const schema = nodeSchema.shape.progress
        for (const value of [undefined, null, 0, 47.5, 100]) expect(schema.parse(value)).toBe(value)
        for (const value of [-1, 101, NaN, Infinity, '47']) expect(schema.safeParse(value).success).toBe(false)
    })
})
