import { builtinCliTools } from '@xpert-ai/cli-model-profiles'
import { MODEL_EXECUTION_POLICY_SETTING } from '@xpert-ai/contracts'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { TenantSetting } from '@xpert-ai/server-core'
import { defaultExecutionLimits } from './execution-policy.defaults'
import { ModelExecutionPolicyService, parseExecutionPolicy } from './execution-policy'
import { assertExecutionAdmission } from './execution-admission.service'

export const testPolicy = {
    enabled: true,
    gatewayBaseUrl: 'http://gateway.test/api/model-execution/openai/v1',
    limits: {
        tokenBudget: 10000,
        userTokenBudget: 20000,
        maxConcurrentRequests: 2,
        requestsPerMinute: 10,
        leaseSeconds: 60,
        maxDurationSeconds: 600
    },
    chatBridgeProtocols: [],
    cliPermissions: { defaultMode: 'allow', overrides: {} },
    tools: [{ id: 'aider', executable: '/home/user/.local/bin/aider', version: '0.86.1' }]
}

describe('execution policy and admission', () => {
    it.each([undefined, null, '', {}, { enabled: false }, '{"enabled":false}'])(
        'provides defaults for new and legacy tenants: %j',
        (value) => {
            expect(parseExecutionPolicy(value)).toMatchObject({
                enabled: true,
                tools: builtinCliTools,
                limits: defaultExecutionLimits,
                chatBridgeProtocols: ['openai_responses', 'anthropic_messages']
            })
        }
    )
    it('retains explicit limits, tools and protocol restrictions while ignoring the old switch', () => {
        expect(parseExecutionPolicy(JSON.stringify(testPolicy))).toEqual(testPolicy)
        expect(parseExecutionPolicy({ ...testPolicy, enabled: false })).toEqual(testPolicy)
    })
    it('discards a legacy input cap without constraining the policy budget', () => {
        const legacy = {
            ...testPolicy,
            limits: { ...testPolicy.limits, maxInputTokens: 128000, maxOutputTokens: 16384 }
        }
        expect(parseExecutionPolicy(legacy)).toEqual(testPolicy)
        expect(parseExecutionPolicy(legacy).limits).not.toHaveProperty('maxInputTokens')
    })
    it('does not share mutable defaults between tenants', () => {
        const first = parseExecutionPolicy(undefined)
        first.tools[0].version = '0.0.0'
        first.limits.tokenBudget = 1
        first.cliPermissions.overrides.qwen = 'restricted'
        expect(parseExecutionPolicy(undefined).tools).toEqual(builtinCliTools)
        expect(parseExecutionPolicy(undefined).limits).toEqual(defaultExecutionLimits)
        expect(parseExecutionPolicy(undefined).cliPermissions).toEqual({ defaultMode: 'allow', overrides: {} })
    })
    it('accepts tool-specific approval overrides and rejects malformed policy', () => {
        const cliPermissions = { defaultMode: 'allow', overrides: { qwen: 'restricted' } }
        expect(parseExecutionPolicy({ cliPermissions }).cliPermissions).toEqual(cliPermissions)
        for (const input of [
            { defaultMode: 'ask' },
            { overrides: { qwen: true } },
            { overrides: { '../qwen': 'allow' } },
            { defaultMode: 'allow', extra: true }
        ])
            expect(() => parseExecutionPolicy({ cliPermissions: input })).toThrow()
    })
    it('rejects malformed persistence instead of silently allowing defaults', () => {
        for (const value of ['{', 'null', [], 123, { enabled: 'false' }, { tools: [] }, { unknown: true }])
            expect(() => parseExecutionPolicy(value)).toThrow()
    })
    it('resolves defaults and overrides in the requested tenant without writing a setting', async () => {
        const settings = { findOneBy: jest.fn(), save: jest.fn() }
        settings.findOneBy.mockResolvedValueOnce(null).mockResolvedValueOnce({ value: JSON.stringify(testPolicy) })
        const module = await Test.createTestingModule({
            providers: [ModelExecutionPolicyService, { provide: getRepositoryToken(TenantSetting), useValue: settings }]
        }).compile()
        try {
            const service = module.get(ModelExecutionPolicyService)
            await expect(service.require('new-tenant')).resolves.toEqual(parseExecutionPolicy(undefined))
            await expect(service.require('configured-tenant')).resolves.toEqual(testPolicy)
            expect(settings.findOneBy.mock.calls).toEqual([
                [{ tenantId: 'new-tenant', name: MODEL_EXECUTION_POLICY_SETTING }],
                [{ tenantId: 'configured-tenant', name: MODEL_EXECUTION_POLICY_SETTING }]
            ])
            expect(settings.save).not.toHaveBeenCalled()
            settings.findOneBy.mockResolvedValueOnce({ value: '{' })
            await expect(service.require('broken-tenant')).rejects.toThrow()
        } finally {
            await module.close()
        }
    })
    it('rejects ambiguous tool IDs and parent-directory executable paths', () => {
        const tool = testPolicy.tools[0]
        expect(() => parseExecutionPolicy({ tools: [tool, { ...tool, version: '1.0.0' }] })).toThrow()
        expect(() => parseExecutionPolicy({ tools: [{ ...tool, executable: '/usr/bin/../bin/aider' }] })).toThrow()
    })
    it.each(['maxConcurrentRequests', 'requestsPerMinute', 'leaseSeconds', 'maxDurationSeconds'])(
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
