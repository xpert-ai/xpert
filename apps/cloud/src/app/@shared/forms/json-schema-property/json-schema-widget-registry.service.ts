import { Inject, Injectable, InjectionToken, Optional, Provider, Type, signal, WritableSignal } from '@angular/core'
import { JsonSchema7TypeUnion } from 'zod-to-json-schema'
import { TWorkflowVarGroup } from '../../../@core'

export interface JsonSchemaWidgetDefinition {
  name: string
  component?: Type<unknown>
  load?: () => Promise<Type<unknown>>
}

export interface JsonSchemaWidgetContext<T = unknown> {
  schema?: JsonSchema7TypeUnion
  xUi?: Record<string, unknown>
  value?: WritableSignal<T>
  readonly?: boolean
  required?: boolean
  variables?: TWorkflowVarGroup[]
  update: (value: T) => void
}

export const JSON_SCHEMA_WIDGETS = new InjectionToken<JsonSchemaWidgetDefinition[]>('JSON_SCHEMA_WIDGETS')
export const JSON_SCHEMA_WIDGET_CONTEXT = new InjectionToken<JsonSchemaWidgetContext>('JSON_SCHEMA_WIDGET_CONTEXT')

@Injectable({ providedIn: 'root' })
export class JsonSchemaWidgetRegistry {
  #widgets = signal<Record<string, JsonSchemaWidgetDefinition>>({})

  constructor(@Optional() @Inject(JSON_SCHEMA_WIDGETS) widgets?: JsonSchemaWidgetDefinition[]) {
    this.registerMany(widgets ?? [])
  }

  register(widget: JsonSchemaWidgetDefinition) {
    if (!widget?.name) {
      return
    }
    this.#widgets.update((current) => ({
      ...current,
      [widget.name]: {
        ...current[widget.name],
        ...widget
      }
    }))
  }

  registerMany(widgets: JsonSchemaWidgetDefinition[]) {
    widgets?.forEach((widget) => this.register(widget))
  }

  has(name?: string | null) {
    return !!(name && this.#widgets()[name])
  }

  get(name?: string | null) {
    if (!name) return null
    return this.#widgets()[name] ?? null
  }

  async loadComponent(name: string) {
    const widget = this.get(name)
    if (!widget) return null

    if (widget.component) {
      return widget.component
    }

    if (widget.load) {
      const component = await widget.load()
      this.register({
        ...widget,
        component
      })
      return component
    }

    return null
  }
}

export function provideJsonSchemaWidgets(...widgets: JsonSchemaWidgetDefinition[]): Provider[] {
  return widgets.map((widget) => ({
    provide: JSON_SCHEMA_WIDGETS,
    useValue: widget,
    multi: true
  }))
}
