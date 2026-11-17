import * as config from '@xpert-ai/server-config'
import { readProjectExecutionConfig } from '../../../config/src/project-execution-config'
import { parseExecutionPolicy } from './execution-policy'
import { resolveExecutionDuration, remainingExecutionSeconds } from './execution-duration'
import { defaultExecutionLimits } from './execution-policy.defaults'

describe('execution duration policy', () => {
    it('defaults new task execution to twelve hours', () => {
        const policy = parseExecutionPolicy({})
        expect(policy.defaultDurationSeconds).toBe(43200)
        expect(policy.limits.maxDurationSeconds).toBe(43200)
        expect(resolveExecutionDuration(policy)).toBe(43200)
        expect(resolveExecutionDuration(policy, 7200)).toBe(7200)
    })
    const originalOptions = { ...config.getConfig().projectExecutionOptions }
    afterEach(() => {
        config.setConfig({ projectExecutionOptions: originalOptions })
        jest.restoreAllMocks()
    })
    it.each([60, 119, 120, 121, 43200, 86400])(
        'resolves a valid execution policy from the accepted host duration %s',
        (seconds) => {
            config.setConfig({
                projectExecutionOptions: readProjectExecutionConfig({
                    XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS: String(seconds)
                })
            })
            const policy = parseExecutionPolicy({})
            expect(policy.defaultDurationSeconds).toBe(seconds)
            expect(policy.limits.maxDurationSeconds).toBe(seconds)
            expect(policy.limits.leaseSeconds).toBeLessThanOrEqual(seconds)
            if (seconds >= 120) expect(policy.limits.leaseSeconds).toBe(120)
            expect(resolveExecutionDuration(policy)).toBe(seconds)
        }
    )
    it('keeps an explicit tenant policy when the host default becomes shorter than its lease', () => {
        const limits = { ...defaultExecutionLimits(), maxDurationSeconds: 1800 }
        config.setConfig({
            projectExecutionOptions: readProjectExecutionConfig({ XPERT_TASK_EXECUTION_MAX_DURATION_SECONDS: '60' })
        })
        const policy = parseExecutionPolicy({ limits })
        expect(policy.limits).toEqual(limits)
        expect(policy.limits.leaseSeconds).toBe(120)
        expect(resolveExecutionDuration(policy)).toBe(1800)
    })
    it('reads typed host configuration at resolution time without extending a pinned attempt', () => {
        const pinned = parseExecutionPolicy({})
        config.setConfig({
            projectExecutionOptions: { taskMaxDurationSeconds: 21600, pipelineMaxTokens: 100000000 }
        })
        expect(resolveExecutionDuration(parseExecutionPolicy({}))).toBe(21600)
        expect(parseExecutionPolicy({}).limits.maxDurationSeconds).toBe(21600)
        expect(resolveExecutionDuration(pinned)).toBe(43200)
    })
    it('preserves legacy explicit duration as both default and ceiling', () => {
        const policy = parseExecutionPolicy({ limits: { ...defaultExecutionLimits(), maxDurationSeconds: 1800 } })
        expect(resolveExecutionDuration(policy)).toBe(1800)
        expect(resolveExecutionDuration(policy, 7200)).toBe(1800)
    })
    it('supports a lower default and rejects defaults above the ceiling', () => {
        expect(resolveExecutionDuration(parseExecutionPolicy({ defaultDurationSeconds: 600 }))).toBe(600)
        expect(() => parseExecutionPolicy({ defaultDurationSeconds: 43201 })).toThrow()
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
