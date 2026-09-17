import { Injectable } from '@nestjs/common'
import { Subject } from 'rxjs'
import { StrategyEntry } from './types'

export type StrategyBusEvent<S = any> =
  | { type: 'UPSERT'; strategyType: string; entry: StrategyEntry<S> }
  | { type: 'REMOVE'; strategyType?: string; pluginName: string; orgId: string; cause?: 'refresh' | 'uninstall' }

@Injectable()
export class StrategyBus {
  private readonly removalGuards = new Set<(scopeKey: string, pluginNames: readonly string[]) => Promise<void>>()

  registerRemovalGuard(guard: (scopeKey: string, pluginNames: readonly string[]) => Promise<void>) {
    this.removalGuards.add(guard)
    return () => {
      this.removalGuards.delete(guard)
    }
  }

  async assertCanRemove(scopeKey: string, pluginNames: readonly string[]) {
    for (const guard of this.removalGuards) await guard(scopeKey, pluginNames)
  }

  private readonly subject = new Subject<StrategyBusEvent>()

  readonly events$ = this.subject.asObservable()

  upsert<S>(strategyType: string, entry: StrategyEntry<S>) {
    this.subject.next({ type: 'UPSERT', strategyType, entry })
  }

  remove(orgId: string, pluginName: string, cause?: 'refresh' | 'uninstall') {
    this.subject.next({ type: 'REMOVE', orgId, pluginName, ...(cause ? { cause } : {}) })
  }
}
