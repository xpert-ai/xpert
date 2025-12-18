import {
  Component,
  ComponentRef,
  DestroyRef,
  EnvironmentInjector,
  Injector,
  ViewContainerRef,
  WritableSignal,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core'
import { SIGNAL } from '@angular/core/primitives/signals'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { JsonSchema7TypeUnion } from 'zod-to-json-schema'
import { TWorkflowVarGroup } from '../../../@core'
import {
  JSON_SCHEMA_WIDGET_CONTEXT,
  JsonSchemaWidgetContext,
  JsonSchemaWidgetStrategyRegistry,
} from './json-schema-widget-registry.service'

@Component({
  selector: 'xp-json-schema-widget-outlet',
  standalone: true,
  template: '',
  hostDirectives: [NgxControlValueAccessor]
})
export class JsonSchemaWidgetOutletComponent {
  protected cva = inject<NgxControlValueAccessor<unknown>>(NgxControlValueAccessor)
  
  readonly name = input<string | null>(null)
  readonly schema = input<JsonSchema7TypeUnion | undefined>(undefined)
  readonly xUi = input<Record<string, unknown> | undefined>(undefined)
  readonly readonly = input<boolean>(false)
  readonly required = input<boolean>(false)
  readonly variables = input<TWorkflowVarGroup[] | undefined>(undefined)
  readonly context = input<Record<string, unknown> | undefined>(undefined)

  #componentRef?: ComponentRef<any>
  #destroyed = false

  readonly #value = this.cva.value$

  constructor(
    private readonly viewContainerRef: ViewContainerRef,
    private readonly injector: Injector,
    private readonly environmentInjector: EnvironmentInjector,
    private readonly registry: JsonSchemaWidgetStrategyRegistry,
    destroyRef: DestroyRef
  ) {
    destroyRef.onDestroy(() => {
      this.#destroyed = true
      this.#teardown()
    })

    effect(() => {
      const value = this.#value()
      if (!this.#componentRef) {
        return
      }
      this.#componentRef.instance.writeValue?.(value)
    }, { allowSignalWrites: true })

    effect(
      () => {
        if (!this.#componentRef) {
          return
        }
        this.applyInputsToInstance()
      },
      { allowSignalWrites: true }
    )

    afterNextRender(() => {
      this.#render()
    })
  }

  async #render() {
    const name = this.name()
    const schema = this.schema()
    const xUi = this.xUi()
    const isReadonly = this.readonly()
    const isRequired = this.required()
    const variables = this.variables()
    this.#teardown()

    if (!name) {
      return
    }

    const componentType = await this.registry.loadComponent(name)

    if (!componentType || this.#destroyed) {
      return
    }

    const context: JsonSchemaWidgetContext = {
      schema,
      xUi,
      value: this.#value as WritableSignal<unknown>,
      readonly: isReadonly,
      required: isRequired,
      variables,
      context: this.context,
      update: (value) => {
        this.#value.set(value)
      }
    }

    const injector = Injector.create({
      parent: this.injector,
      providers: [
        {
          provide: JSON_SCHEMA_WIDGET_CONTEXT,
          useValue: context
        }
      ]
    })

    this.#componentRef = this.viewContainerRef.createComponent(componentType, {
      environmentInjector: this.environmentInjector,
      injector
    })

    this.applyInputsToInstance()
    this.#componentRef.instance.writeValue?.(this.#value())

    const instance = this.#componentRef.instance as any
    if (instance?.registerOnChange) {
      instance.registerOnChange((value: unknown) => {
        this.#value.set(value)
      })
    }
  }

  #teardown() {
    this.viewContainerRef.clear()
    this.#componentRef?.destroy()
    this.#componentRef = undefined
  }

  private applyInputsToInstance() {
    const instance = this.#componentRef.instance
    if (instance.readonly?.[SIGNAL]) {
      instance.readonly[SIGNAL].applyValueToInputSignal(instance.readonly[SIGNAL], this.readonly())
    }
    if (instance.required?.[SIGNAL]) {
      instance.required[SIGNAL].applyValueToInputSignal(instance.required[SIGNAL], this.required())
    }
    if (instance.schema?.[SIGNAL]) {
      instance.schema[SIGNAL].applyValueToInputSignal(instance.schema[SIGNAL], this.schema())
    }
    if (instance.xUi?.[SIGNAL]) {
      instance.xUi[SIGNAL].applyValueToInputSignal(instance.xUi[SIGNAL], this.xUi())
    }
    if (instance.variables?.[SIGNAL]) {
      instance.variables[SIGNAL].applyValueToInputSignal(instance.variables[SIGNAL], this.variables())
    }
    if (this.xUi()?.['inputs']) {
      const inputs = this.xUi()?.['inputs'] as Record<string, unknown>
      for (const [key, value] of Object.entries(inputs)) {
        if (instance[key]?.[SIGNAL]) {
          instance[key][SIGNAL].applyValueToInputSignal(instance[key][SIGNAL], value)
        }
      }
    }
  }
}
