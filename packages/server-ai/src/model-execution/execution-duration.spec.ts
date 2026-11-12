import { parseExecutionPolicy } from './execution-policy'
import { resolveExecutionDuration, remainingExecutionSeconds } from './execution-duration'
import { defaultExecutionLimits } from './execution-policy.defaults'

describe('execution duration policy', () => {
    it('defaults ordinary work to one hour while permitting two-hour Project tasks', () => {
        const policy = parseExecutionPolicy({})
        expect(policy.defaultDurationSeconds).toBe(3600)
        expect(policy.limits.maxDurationSeconds).toBe(7200)
        expect(resolveExecutionDuration(policy)).toBe(3600)
        expect(resolveExecutionDuration(policy, 7200)).toBe(7200)
    })
    it('preserves legacy explicit duration as both default and ceiling', () => {
        const policy = parseExecutionPolicy({ limits: { ...defaultExecutionLimits, maxDurationSeconds: 1800 } })
        expect(resolveExecutionDuration(policy)).toBe(1800)
        expect(resolveExecutionDuration(policy, 7200)).toBe(1800)
    })
    it('supports a lower default and rejects defaults above the ceiling', () => {
        expect(resolveExecutionDuration(parseExecutionPolicy({ defaultDurationSeconds: 600 }))).toBe(600)
        expect(() => parseExecutionPolicy({ defaultDurationSeconds: 8000 })).toThrow()
    })
    it.each([0, -1, 0.5, 90.5, NaN, Infinity, 86401])('rejects invalid requested duration %s', (value) => {
        expect(() => resolveExecutionDuration(parseExecutionPolicy({}), value)).toThrow()
    })
    it('launches only for the remaining grant lifetime, never adding preparation time', () => {
        jest.spyOn(Date, 'now').mockReturnValue(100000)
        expect(remainingExecutionSeconds({ absoluteExpiresAt: new Date(104999) })).toBe(4)
        expect(() => remainingExecutionSeconds({ absoluteExpiresAt: new Date(99999) })).toThrow()
        jest.restoreAllMocks()
    })
})
