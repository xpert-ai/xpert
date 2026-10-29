import { NativeUpstreamError } from './execution-native-upstream-error'

describe('native upstream error boundary', () => {
    it('preserves a valid HTTP-date retry interval and alternate request ID', () => {
        const error = new NativeUpstreamError(
            new Response(null, {
                status: 503,
                headers: { 'retry-after': 'Wed, 21 Oct 2037 07:28:00 GMT', 'request-id': 'provider:123' }
            })
        )
        expect(error.getStatus()).toBe(503)
        expect(error.headers).toEqual({
            'retry-after': new Date('Wed, 21 Oct 2037 07:28:00 GMT').toUTCString(),
            'x-upstream-request-id': 'provider:123'
        })
    })

    it.each(['-1', '1.5', 'secret', '999999999999', 'Wed, 99 Oct 2037 07:28:00 GMT'])(
        'drops invalid retry and diagnostic header values (%s)',
        (retryAfter) => {
            const error = new NativeUpstreamError(
                new Response(null, {
                    status: 502,
                    headers: {
                        'retry-after': retryAfter,
                        'x-request-id': '<private response>',
                        'cf-ray': 'private'
                    }
                })
            )
            expect(error.headers).toEqual({})
        }
    )
})
