import type { ThreadActivityError } from '@xpert-ai/contracts'
import { HttpException } from '@nestjs/common'
import { t } from 'i18next'
import { catchError, Observable, of } from 'rxjs'
import type { SseMessageEvent } from '../../shared/stream/redis-sse.service'

/** Once SSE headers are sent, retain status in the event instead of Nest's message-only fallback. */
export function threadActivityErrors() {
    return catchError<SseMessageEvent, Observable<SseMessageEvent>>((error: unknown) => {
        const data: ThreadActivityError = {
            version: 1,
            status: error instanceof HttpException ? error.getStatus() : 500,
            message:
                error instanceof HttpException
                    ? error.message
                    : t('server-ai:Error.ThreadActivityUnavailable', {
                          defaultValue: 'Thread updates are temporarily unavailable.'
                      })
        }
        return of({ type: 'error', data })
    })
}
