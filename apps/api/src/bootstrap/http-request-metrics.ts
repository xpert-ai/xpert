import type { HttpRequestMetricInput } from '@xpert-ai/server-ai'
import type { RequestHandler } from 'express'
import { performance } from 'node:perf_hooks'

const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'CONNECT', 'TRACE'])

/** Record response completion, including guards/errors, without using URLs or query strings as labels. */
export function createHttpRequestMetricsMiddleware(
  record: (input: HttpRequestMetricInput) => void,
  now: () => number = () => performance.now()
): RequestHandler {
  return (request, response, next) => {
    if (!/^\/api(?:\/|$)/.test(request.path) || /^\/api\/(?:metrics|health)(?:\/|$)/.test(request.path)) {
      next()
      return
    }

    const startedAt = now()
    const finish = (outcome: HttpRequestMetricInput['outcome']) => {
      response.off('finish', onFinish)
      response.off('close', onClose)
      const contentType = response.getHeader('content-type')
      const route: unknown = request.route
      // baseUrl contains resolved mount parameters; only the registered route template is safe.
      const routeTemplate =
        route && typeof route === 'object' && 'path' in route && typeof route.path === 'string'
          ? route.path
          : 'unmatched'

      record({
        method: HTTP_METHODS.has(request.method) ? request.method : 'OTHER',
        route: routeTemplate,
        statusCode: outcome === 'aborted' && !response.headersSent ? 499 : response.statusCode,
        responseType:
          typeof contentType === 'string' && contentType.split(';', 1)[0].trim().toLowerCase() === 'text/event-stream'
            ? 'sse'
            : 'http',
        outcome,
        durationMs: Math.max(0, now() - startedAt)
      })
    }
    const onFinish = () => finish('completed')
    const onClose = () => finish('aborted')
    response.once('finish', onFinish)
    response.once('close', onClose)
    next()
  }
}
