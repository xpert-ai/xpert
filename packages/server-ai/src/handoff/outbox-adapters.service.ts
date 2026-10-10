import { Injectable } from '@nestjs/common'

/** Typed recovery adapters share the existing Handoff transport scan; adapters never execute models. */
export interface HandoffOutboxAdapter {
    reconcile(): Promise<void>
}

@Injectable()
export class HandoffOutboxAdapters {
    private readonly adapters = new Set<HandoffOutboxAdapter>()
    /** Register at module initialization; dispose at shutdown to avoid retaining inactive adapters. */
    register(adapter: HandoffOutboxAdapter) {
        this.adapters.add(adapter)
        return () => this.adapters.delete(adapter)
    }
    /** Isolate adapter failures so one feature cannot prevent other durable deliveries from recovering. */
    async reconcile() {
        await Promise.allSettled([...this.adapters].map((adapter) => Promise.resolve().then(() => adapter.reconcile())))
    }
}
