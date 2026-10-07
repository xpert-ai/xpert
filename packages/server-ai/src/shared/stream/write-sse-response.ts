// Why this exists: Nest's @Sse with interceptors flushes headers before run setup.
// Start the response only after admission so Content-Location acknowledges a real run.
// Disconnecting this reader must not cancel the independently persisted Agent stream.
import { SseStream } from '@nestjs/core/router/sse-stream'
import { Request, Response } from 'express'
import { Observable, concatMap } from 'rxjs'
import type { SseMessageEvent } from './redis-sse.service'

export function writeSseResponse(req: Request, res: Response, events: Observable<SseMessageEvent>): void {
    if (res.destroyed || res.writableEnded) return

    const stream = new SseStream(req)
    stream.pipe(res, { additionalHeaders: res.getHeaders(), statusCode: res.statusCode })
    const subscription = events
        .pipe(
            concatMap(
                (event) =>
                    new Promise<void>((resolve, reject) => {
                        stream.writeMessage(
                            {
                                ...event,
                                data:
                                    typeof event.data === 'string' ? event.data : (JSON.stringify(event.data) ?? 'null')
                            },
                            (error) => (error ? reject(error) : resolve())
                        )
                    })
            )
        )
        .subscribe({
            complete: () => res.end(),
            error: (error: unknown) => {
                if (res.destroyed || res.writableEnded) return
                stream.writeMessage(
                    { type: 'error', data: error instanceof Error ? error.message : String(error) },
                    () => res.end()
                )
            }
        })
    res.once('close', () => {
        subscription.unsubscribe()
        if (!stream.writableEnded) stream.end()
    })
}
