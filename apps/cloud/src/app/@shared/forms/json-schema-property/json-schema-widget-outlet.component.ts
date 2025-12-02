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
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { JsonSchema7TypeUnion } from 'zod-to-json-schema'
import { TWorkflowVarGroup } from '../../../@core'
import {
  JSON_SCHEMA_WIDGET_CONTEXT,
  JsonSchemaWidgetContext,
  JsonSchemaWidgetRegistry
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

  #componentRef?: ComponentRef<any>
  #destroyed = false
  #componentModelSub?: { unsubscribe: () => void }

  readonly #value = this.cva.value$

  constructor(
    private readonly viewContainerRef: ViewContainerRef,
    private readonly injector: Injector,
    private readonly environmentInjector: EnvironmentInjector,
    private readonly registry: JsonSchemaWidgetRegistry,
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
        this.#componentRef.instance.readonly?.set(this.readonly())
        this.#componentRef.instance.required?.set(this.required())
        this.#componentRef.instance.schema?.set(this.schema())
        this.#componentRef.instance.xUi?.set(this.xUi())
        this.#componentRef.instance.variables?.set(this.variables())
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

    this.#componentRef.instance.readonly?.set(this.readonly())
    this.#componentRef.instance.required?.set(this.required())
    this.#componentRef.instance.schema?.set(this.schema())
    this.#componentRef.instance.xUi?.set(this.xUi())
    this.#componentRef.instance.variables?.set(this.variables())
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
    this.#componentModelSub?.unsubscribe?.()
    this.#componentModelSub = undefined
  }
}
