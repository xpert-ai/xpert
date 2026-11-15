import type { CollaborationBroadcast } from './collaboration.service'

/** Notifications may coalesce. Durable deltas must keep order or force a state resync. */
export class CollaborationMailbox {
    private revision?: Extract<CollaborationBroadcast, { type: 'revision' }>
    private readonly presence = new Map<string, CollaborationBroadcast>()
    private readonly updates: Array<{ event: CollaborationBroadcast; bytes: number }> = []
    private bytes = 0

    push(event: CollaborationBroadcast): boolean {
        if (event.type === 'revision') {
            if (!this.revision || event.payload.revision > this.revision.payload.revision) this.revision = event
        } else if (event.type === 'update') {
            const bytes = Buffer.byteLength(JSON.stringify(event.payload), 'utf8')
            if (this.updates.length >= 64 || this.bytes + bytes > 2 * 1024 * 1024) return false
            this.updates.push({ event, bytes })
            this.bytes += bytes
        } else {
            const key = event.payload.clientId
            if (typeof key !== 'string' || !key || key.length > 128) return true
            this.presence.delete(key)
            if (this.presence.size >= 128) this.presence.delete(this.presence.keys().next().value!)
            this.presence.set(key, event)
        }
        return true
    }

    get pending() {
        return this.updates.length > 0 || !!this.revision || this.presence.size > 0
    }

    take(): CollaborationBroadcast | undefined {
        const update = this.updates.shift()
        if (update) {
            this.bytes -= update.bytes
            return update.event
        }
        if (this.revision) {
            const event = this.revision
            this.revision = undefined
            return event
        }
        const first = this.presence.entries().next().value
        if (first) {
            this.presence.delete(first[0])
            return first[1]
        }
        return undefined
    }

    clear() {
        this.revision = undefined
        this.presence.clear()
        this.updates.length = 0
        this.bytes = 0
    }
}
