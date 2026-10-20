import { pipelineAdmissionPolicy } from './pipeline-admission'

describe('Pipeline deployment admission policy', () => {
    it('keeps unspecified capacities compatible and accepts explicit positive bounded limits', () => {
        expect(pipelineAdmissionPolicy({})).toEqual({ global: undefined, tenant: undefined, assistant: undefined })
        expect(
            pipelineAdmissionPolicy({
                XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS: '100',
                XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_TENANT: '20',
                XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS_PER_ASSISTANT: '2'
            })
        ).toEqual({ global: 100, tenant: 20, assistant: 2 })
    })
    it.each(['', '0', '-1', '1.5', 'NaN', '100001', '1e3', ' 2'])(
        'rejects invalid capacity %s instead of silently disabling it',
        (value) => {
            expect(() => pipelineAdmissionPolicy({ XPERT_PIPELINE_MAX_ACTIVE_OPERATIONS: value })).toThrow()
        }
    )
})
