import { Injectable } from '@nestjs/common';
import { ReplaySubject } from 'rxjs';
import { StrategyEntry } from './types';

export type StrategyBusEvent<S = any> =
  | { type: 'UPSERT'; strategyType: string; entry: StrategyEntry<S> }
  | { type: 'REMOVE'; strategyType?: string; pluginName: string; orgId: string };

@Injectable()
export class StrategyBus {
  private readonly subject = new ReplaySubject<StrategyBusEvent>(256);

  readonly events$ = this.subject.asObservable();

  upsert<S>(strategyType: string, entry: StrategyEntry<S>) {
    this.subject.next({ type: 'UPSERT', strategyType, entry });
  }

  remove(orgId: string, pluginName: string) {
    this.subject.next({ type: 'REMOVE', orgId, pluginName });
  }
}
