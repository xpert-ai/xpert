import { parseExecutionPolicy } from './execution-policy'
import { assertExecutionAdmission } from './execution-admission.service'

export const testPolicy = {
    enabled: true,
    gatewayBaseUrl: 'http://gateway.test/api/model-execution/openai/v1',
    limits: {
        tokenBudget: 10000,
        userTokenBudget: 20000,
        maxInputTokens: 1000,
        maxOutputTokens: 500,
        maxConcurrentRequests: 2,
        requestsPerMinute: 10,
        leaseSeconds: 60,
        maxDurationSeconds: 600
    },
    tools: [{ id: 'aider', executable: '/home/user/.local/bin/aider', version: '0.86.1' }]
}

describe('execution policy and admission', () => {
    it('is disabled without explicit tenant configuration', () => {
        expect(parseExecutionPolicy(undefined)).toEqual({ enabled: false })
        expect(parseExecutionPolicy(JSON.stringify(testPolicy))).toEqual(testPolicy)
    })
    it.each(['tokenBudget', 'userTokenBudget', 'maxInputTokens', 'maxOutputTokens', 'leaseSeconds'])(
        'rejects a missing %s limit',
        (key) => {
            const limits = Object.fromEntries(Object.entries(testPolicy.limits).filter(([name]) => name !== key))
            expect(() => parseExecutionPolicy({ ...testPolicy, limits })).toThrow()
        }
    )
    it.each(['https://key:secret@gateway.test/', 'ftp://gateway.test', 'http://gateway.test/?key=secret'])(
        'rejects credential-bearing or unsupported URL %s',
        (gatewayBaseUrl) => {
            expect(() => parseExecutionPolicy({ ...testPolicy, gatewayBaseUrl })).toThrow()
        }
    )
    it('rejects unsupported money limits and unbounded lease settings', () => {
        expect(() =>
            parseExecutionPolicy({ ...testPolicy, limits: { ...testPolicy.limits, amountCny: 100 } })
        ).toThrow()
        expect(() =>
            parseExecutionPolicy({ ...testPolicy, limits: { ...testPolicy.limits, leaseSeconds: 900 } })
        ).toThrow()
    })
    it('includes all outstanding reservations in admission', () => {
        const input = {
            budget: 100,
            used: 30,
            reserved: 50,
            reservation: 20,
            concurrent: 1,
            maxConcurrent: 2,
            recent: 2,
            rpm: 10
        }
        expect(() => assertExecutionAdmission(input)).not.toThrow()
        expect(() => assertExecutionAdmission({ ...input, reservation: 21 })).toThrow()
        expect(() => assertExecutionAdmission({ ...input, concurrent: 2 })).toThrow()
        expect(() => assertExecutionAdmission({ ...input, recent: 10 })).toThrow()
    })
})
