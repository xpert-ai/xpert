import { createHash } from 'node:crypto'
import { Observable } from 'rxjs'
import type { ThreadActivitySnapshot } from '@xpert-ai/contracts'

/** Full snapshots are recoverable from DB; event IDs are content hashes, not delta offsets. */
export function threadActivityStream(read: () => Promise<ThreadActivitySnapshot>, intervalMs = 2000) {
    return new Observable<{ type: string; id: string; data: ThreadActivitySnapshot }>((subscriber) => {
        let closed = false
        let previous = ''
        let timer: ReturnType<typeof setTimeout>
        const poll = async () => {
            try {
                const data = await read()
                if (closed) return
                const id = createHash('sha256').update(JSON.stringify(data)).digest('hex')
                if (id !== previous) {
                    subscriber.next({ type: 'thread.snapshot', id, data })
                    previous = id
                }
                if (!closed) timer = setTimeout(poll, intervalMs)
            } catch (error) {
                if (!closed) subscriber.error(error)
            }
        }
        void poll()
        return () => {
            closed = true
            clearTimeout(timer)
        }
    })
}
