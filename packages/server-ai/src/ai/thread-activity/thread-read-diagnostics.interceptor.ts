// Read failures describe availability, never execution outcome. Keep payloads and identifiers out of diagnostics.
import { CallHandler, ExecutionContext, HttpException, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'
import type { Response } from 'express'
import { catchError, throwError } from 'rxjs'

@Injectable()
export class ThreadReadDiagnosticsInterceptor implements NestInterceptor {
    private readonly logger = new Logger(ThreadReadDiagnosticsInterceptor.name)
    intercept(context: ExecutionContext, next: CallHandler) {
        const requestId = randomUUID()
        const started = Date.now()
        const response = context.switchToHttp().getResponse<Response>()
        // Nest flushes SSE headers before subscribing to the interceptor chain.
        // Diagnostics must not break that subscription; the backend log still carries its request ID.
        if (!response.headersSent) response.setHeader('X-Request-ID', requestId)
        return next.handle().pipe(
            catchError((error: unknown) => {
                const status = error instanceof HttpException ? error.getStatus() : 500
                this.logger.warn(
                    JSON.stringify({
                        event: 'chat.read.failed',
                        requestId,
                        operation: context.getHandler().name,
                        instance: hostname(),
                        pid: process.pid,
                        status,
                        durationMs: Date.now() - started,
                        category: error instanceof Error ? error.name : 'UnknownError'
                    })
                )
                return throwError(() => error)
            })
        )
    }
}
