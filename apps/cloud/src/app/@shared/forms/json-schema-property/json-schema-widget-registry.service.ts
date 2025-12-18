import { Inject, Injectable, InjectionToken, Optional, Provider, Type, signal, WritableSignal, Signal } from '@angular/core'
import { JsonSchema7TypeUnion } from 'zod-to-json-schema'
import { TWorkflowVarGroup } from '../../../@core'


export interface JsonSchemaWidgetStrategy {
  /**
   * Unique name of widget
   */
  name: string;

  /**
   * Static component (optional)
   */
  component?: Type<unknown>;

  /**
   * Lazy loader function
   */
  load?: () => Promise<Type<unknown>>;
}

export interface JsonSchemaWidgetContext<T = unknown> {
  schema?: JsonSchema7TypeUnion
  xUi?: Record<string, unknown>
  value?: WritableSignal<T>
  readonly?: boolean
  required?: boolean
  variables?: TWorkflowVarGroup[]
  context?: Signal<Record<string, unknown>>
  update: (value: T) => void
}

export const JSON_SCHEMA_WIDGET_STRATEGIES =
  new InjectionToken<JsonSchemaWidgetStrategy[]>('JSON_SCHEMA_WIDGET_STRATEGIES')
export const JSON_SCHEMA_WIDGET_CONTEXT = new InjectionToken<JsonSchemaWidgetContext>('JSON_SCHEMA_WIDGET_CONTEXT')

@Injectable()
export class JsonSchemaWidgetStrategyRegistry {
  #strategies = signal<Record<string, JsonSchemaWidgetStrategy>>({})

  constructor(
    @Optional() @Inject(JSON_SCHEMA_WIDGET_STRATEGIES)
    strategies?: JsonSchemaWidgetStrategy[]
  ) {
    this.registerMany(strategies ?? [])
  }

  register(strategy: JsonSchemaWidgetStrategy) {
    if (!strategy?.name) return

    this.#strategies.update(current => ({
      ...current,
      [strategy.name]: {
        ...current[strategy.name],
        ...strategy
      }
    }))
  }

  registerMany(strategies: JsonSchemaWidgetStrategy[]) {
    strategies?.forEach(s => this.register(s))
  }

  has(name?: string | null): boolean {
    return !!(name && this.#strategies()[name])
  }

  get(name?: string | null): JsonSchemaWidgetStrategy | null {
    if (!name) return null
    return this.#strategies()[name] ?? null
  }

  async loadComponent(name: string) {
    const strategy = this.get(name)
    if (!strategy) return null

    if (strategy.component) return strategy.component

    if (strategy.load) {
      const component = await strategy.load()
      this.register({ ...strategy, component })
      return component
    }

    return null
  }
}

export function provideJsonSchemaWidgetStrategy(
  ...strategies: JsonSchemaWidgetStrategy[]
): Provider[] {
  return strategies.map(strategy => ({
    provide: JSON_SCHEMA_WIDGET_STRATEGIES,
    useValue: strategy,
    multi: true
  }))
}
