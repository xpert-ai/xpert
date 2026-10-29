// Upstream failures are distinct from execution grants and policy denials.
// Expose only bounded diagnostic headers, never provider response bodies or credentials.
import { HttpException } from '@nestjs/common'
import { applicationMetrics } from '../metrics/application-metrics'
import { executionErrorMessage } from './execution-errors'

export class NativeUpstreamError extends HttpException {
    readonly headers: Record<string, string> = {}

    constructor(upstream: globalThis.Response) {
        // Provider authentication/configuration errors belong to our upstream boundary.
        const status = upstream.status >= 500 || upstream.status === 429 ? upstream.status : 502
        super(executionErrorMessage('Upstream'), status)
        applicationMetrics.recordModelExecution('Upstream')
        const retryAfter = upstream.headers.get('retry-after')
        if (retryAfter && /^\d{1,10}$/.test(retryAfter)) {
            this.headers['retry-after'] = retryAfter
        } else if (
            retryAfter &&
            /^[A-Za-z]{3}, \d{2} [A-Za-z]{3} \d{4} \d{2}:\d{2}:\d{2} GMT$/.test(retryAfter) &&
            Number.isFinite(Date.parse(retryAfter))
        ) {
            this.headers['retry-after'] = new Date(retryAfter).toUTCString()
        }
        const requestId = upstream.headers.get('x-request-id') ?? upstream.headers.get('request-id')
        if (requestId && /^[A-Za-z0-9._:-]{1,256}$/.test(requestId)) this.headers['x-upstream-request-id'] = requestId
        const rayId = upstream.headers.get('cf-ray')
        if (rayId && /^[a-fA-F0-9]{16}(?:-[A-Z]{3})?$/.test(rayId)) this.headers['x-upstream-cf-ray'] = rayId
    }
}
