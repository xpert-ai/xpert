import { assertPipelineDispatchEnabled, pipelineDispatchEnabled } from './pipeline-dispatch-policy'

describe('pipeline deployment dispatch policy', () => {
    const previous = process.env.XPERT_PIPELINE_DISPATCH_ENABLED
    afterEach(() => {
        if (previous === undefined) delete process.env.XPERT_PIPELINE_DISPATCH_ENABLED
        else process.env.XPERT_PIPELINE_DISPATCH_ENABLED = previous
    })
    it.each([undefined, 'true', '1'])('allows the compatible default and explicit enable (%s)', (value) => {
        if (value === undefined) delete process.env.XPERT_PIPELINE_DISPATCH_ENABLED
        else process.env.XPERT_PIPELINE_DISPATCH_ENABLED = value
        expect(pipelineDispatchEnabled()).toBe(true)
        expect(() => assertPipelineDispatchEnabled()).not.toThrow()
    })
    it.each(['false', '0', '', 'invalid'])('fails closed for a disabled or invalid setting (%s)', (value) => {
        process.env.XPERT_PIPELINE_DISPATCH_ENABLED = value
        expect(pipelineDispatchEnabled()).toBe(false)
        expect(assertPipelineDispatchEnabled).toThrow(
            expect.objectContaining({
                status: 503,
                response: expect.objectContaining({ code: 'PIPELINE_DISPATCH_PAUSED' })
            })
        )
    })
})
