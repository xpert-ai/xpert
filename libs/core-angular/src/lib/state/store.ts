import { DestroyRef, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { PropsFactory, ReducerContext, Store, StoreConfig, StoreDef, createState, select } from '@ngneat/elf'
import { produce } from 'immer'
import { cloneDeep, isEqual, isObject, negate, pick } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { Observable, Subscription, distinctUntilChanged, filter, map, startWith } from 'rxjs'

export function write<S>(updater: (state: S) => void): (state: S) => S {
  return function (state) {
    return produce(state, (draft) => {
      const r = updater(draft as S)
      return r === undefined ? draft : r
    })
  }
}

export interface SubStoreConfig extends StoreConfig {
  properties?: any[]
  arrayKey?: string
}

export class SubStore<SDef extends StoreDef = any, State = SDef['state']> extends Store<SDef, State> {
  readonly #destroyRef = inject(DestroyRef)
  readonly #logger? = inject(NGXLogger, { optional: true })

  #subscription: Subscription
  #upbackSubscription: Subscription
  #initialized = false

  #context: ReducerContext = {
    config: this.getConfig(),
    setEvent: (action: any) => {}
  }

  constructor(
    private parent: Store,
    storeDef: SDef,
    private options: { properties?: Array<string | number>; arrayKey?: string }
  ) {
    super(storeDef)
  }

  subscribeParent(properties: Array<string | number>) {
    const base = this.parent.pipe(startWith(this.parent.getValue()))
    return properties.reduce((obs, prop) => {
      return obs.pipe(
        select((state) => {
          return Array.isArray(state)
            ? state.find((item) => item?.[this.options.arrayKey ?? 'id'] === prop)
            : state?.[prop]
        })
      )
    }, base)
  }

  connect(properties?: Array<string | number>) {
    properties = this.options.properties = properties ?? this.options.properties
    if (!properties) {
      return this
    }

    // When reconnect
    this.#initialized = false

    this.#upbackSubscription?.unsubscribe()
    this.#upbackSubscription = this.pipe(distinctUntilChanged(), filter(() => this.#initialized), takeUntilDestroyed(this.#destroyRef)).subscribe(
      (newValue) => {
        this.#logger?.trace(`SubStore [${this.name}] update back to parent:`, newValue)
        this.parent.update(
          write((state) => {
            properties.reduce((accumulator, currentValue, currentIndex, arr) => {
              if (currentIndex === arr.length - 1) {
                if (Array.isArray(accumulator)) {
                  const index = accumulator.findIndex((item) => item?.[this.options.arrayKey ?? 'id'] === currentValue)
                  if (index > -1) {
                    accumulator[index] = newValue
                  }
                } else if (isObject(accumulator)) {
                  accumulator[currentValue] = newValue
                }
              } else {
                return Array.isArray(accumulator)
                  ? accumulator.find((item) => item?.[this.options.arrayKey ?? 'id'] === currentValue)
                  : accumulator?.[currentValue]
              }
            }, state)
          })
        )
      }
    )

    this.#subscription?.unsubscribe()
    this.#subscription = this.subscribeParent(properties)
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (value) => {
          this.#logger?.trace(`SubStore [${this.name}] update state from parent:`, value)
          this.update(() => value ?? this.state)
          this.#initialized = true
        },
        error: (err) => {
          this.error()
        },
        complete: () => {
          this.complete()
        }
      })

    return this
  }

  disconnect() {
    this.#subscription?.unsubscribe()
    this.#upbackSubscription?.unsubscribe()
  }
}

export function createSubStore<T, S extends [PropsFactory<any, any>, ...PropsFactory<any, any>[]]>(
  parent: Store<StoreDef<T>>,
  storeConfig: SubStoreConfig,
  ...propsFactories: S
) {
  const { state, config } = createState(...propsFactories)
  const { name, arrayKey } = storeConfig

  return new SubStore(parent, { name, state, config }, { arrayKey }).connect(storeConfig.properties)
}

type Head<State = any> = State | Partial<State>
export type DirtyCheckComparator<State> = (head: State, current: State) => boolean
export type DirtyCheckParams<T = any> = {
  comparator?: DirtyCheckComparator<Head<T>>
  watchProperty?: keyof T | (keyof T)[]
  clean?: (head: Head<T>, current: Head<T>) => Observable<any>
}

export function dirtyCheck(store: Store, params?: DirtyCheckParams) {
  const destroyRef = inject(DestroyRef)
  const active = signal(false)
  const head = signal(null)
  const currentState = signal(null)

  const comparator = params?.comparator ?? ((head, current) => head !== current)
  store
    .pipe(
      map((state) => cloneDeep(params?.watchProperty ? pick(state, params.watchProperty) : state)),
      takeUntilDestroyed(destroyRef)
    )
    .subscribe((value) => currentState.set(value))

  const dirty = computed(() => {
    return active() ? comparator(head(), currentState()) : false
  })
  return {
    active,
    dirty,
    setHead() {
      active.set(true)
      head.set(currentState())
    },
    setPristine(pristine?: unknown) {
      const state = params?.watchProperty ? pick(pristine, params.watchProperty) : pristine
      active.set(true)
      head.set(state)
    }
  }
}

export function dirtyCheckWith(store: Store, with$: Observable<any>, params?: DirtyCheckParams) {
  const destroyRef = inject(DestroyRef)
  const { setPristine, setHead, ...reset } = dirtyCheck(store, params)
  with$.pipe(takeUntilDestroyed(destroyRef)).subscribe(setPristine)
  return { ...reset }
}

export function debugDirtyCheckComparator(a: any, b: any) {
  const dirty = negate(isEqual)(a, b)
  if (dirty) {
    const string1 = JSON.stringify(a)
    const string2 = JSON.stringify(b)
    console.group('DirtyCheckComparator dirty:')
    console.log(string1)
    console.log(string2)
    console.groupEnd()
  }
  return dirty
}
