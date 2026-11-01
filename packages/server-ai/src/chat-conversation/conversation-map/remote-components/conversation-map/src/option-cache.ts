import type { MapOptionsPage } from '../../../schema'

export type OptionPageState = MapOptionsPage & { loaded: boolean; loading: boolean; error: string }
type Loader = (search: string, offset: number) => Promise<MapOptionsPage>
type Entry = { state: OptionPageState; scrollTop: number; offset: number; pending?: Promise<void> }
const empty: OptionPageState = { options: [], nextOffset: null, loaded: false, loading: false, error: '' }

/** Memory belongs to one view host revision. Closing a popover retains pages; invalidation drops late responses. */
export class OptionCache {
    private entries = new Map<string, Entry>()
    private listeners = new Set<() => void>()
    private key(scope: string, search: string) {
        return JSON.stringify([scope, search.trim()])
    }
    subscribe = (listener: () => void) => {
        this.listeners.add(listener)
        return () => {
            this.listeners.delete(listener)
        }
    }
    private notify() {
        this.listeners.forEach((listener) => listener())
    }
    read(scope: string, search: string): OptionPageState {
        return this.entries.get(this.key(scope, search))?.state ?? empty
    }
    scrollTop(scope: string, search: string) {
        return this.entries.get(this.key(scope, search))?.scrollTop ?? 0
    }
    saveScroll(scope: string, search: string, top: number) {
        const entry = this.entries.get(this.key(scope, search))
        if (entry) entry.scrollTop = top
    }
    clear() {
        this.entries.clear()
        this.notify()
    }
    load(scope: string, search: string, loader: Loader, more = false): Promise<void> {
        const key = this.key(scope, search)
        let entry = this.entries.get(key)
        if (!entry) {
            entry = { state: empty, scrollTop: 0, offset: 0 }
            this.entries.set(key, entry)
            // Bound cached search variants without persisting user history outside this view.
            if (this.entries.size > 32) this.entries.delete(this.entries.keys().next().value!)
        }
        if (entry.pending) return entry.pending
        if (entry.state.loaded && !entry.state.error && (!more || entry.state.nextOffset === null))
            return Promise.resolve()
        const current = entry
        const offset = current.state.error ? current.offset : current.state.loaded ? (current.state.nextOffset ?? 0) : 0
        current.offset = offset
        current.state = { ...current.state, loading: true, error: '' }
        const pending = Promise.resolve()
            .then(() => loader(search.trim(), offset))
            .then((page) => {
                if (this.entries.get(key) !== current) return
                current.state = {
                    options: [
                        ...new Map(
                            [...(offset ? current.state.options : []), ...page.options].map((option) => [
                                option.value,
                                option
                            ])
                        ).values()
                    ],
                    nextOffset: page.nextOffset !== null && page.nextOffset > offset ? page.nextOffset : null,
                    loaded: true,
                    loading: false,
                    error: ''
                }
            })
            .catch((error: unknown) => {
                if (this.entries.get(key) === current)
                    current.state = {
                        ...current.state,
                        loading: false,
                        error: error instanceof Error ? error.message : String(error)
                    }
            })
            .finally(() => {
                current.pending = undefined
                if (this.entries.get(key) === current) this.notify()
            })
        current.pending = pending
        this.notify()
        return pending
    }
}
