// Transport comments prevent proxy read-idle expiry; they never signal provider activity.
import type { Response } from 'express'

export function startExecutionSseKeepalive(response: Response, signal: AbortSignal) {
    if (signal.aborted || response.destroyed || response.writableEnded) return () => undefined

    const stop = () => {
        clearInterval(timer)
        signal.removeEventListener('abort', stop)
        response.off('close', stop)
        response.off('finish', stop)
        response.off('error', stop)
    }
    const timer = setInterval(() => {
        if (response.destroyed || response.writableEnded) return stop()
        if (response.writableNeedDrain) return
        try {
            response.write(': keep-alive\n\n')
        } catch {
            stop()
            response.destroy()
        }
    }, 30_000)
    timer.unref()
    signal.addEventListener('abort', stop, { once: true })
    response.once('close', stop)
    response.once('finish', stop)
    response.once('error', stop)
    return stop
}
