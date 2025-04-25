import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { nonBlank, nonNullable } from '@metad/core'
import { effectAction } from '@metad/ocap-angular/core'
import { PropertyDimension, PropertyHierarchy } from '@metad/ocap-core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { select, withProps } from '@ngneat/elf'
import { uuid } from 'apps/cloud/src/app/@core'
import { assign, cloneDeep, isEqual, negate, omit } from 'lodash-es'
import { Observable, distinctUntilChanged, filter, map, shareReplay, switchMap, tap, timer, withLatestFrom } from 'rxjs'
import { createSubStore, dirtyCheckWith, write } from '../../store'
import { SemanticModelService } from '../model.service'
import { ModelDesignerType } from '../types'
import { upsertHierarchy } from '../utils'

@Injectable()
export class ModelDimensionService {
  #destroyRef = inject(DestroyRef)
  private modelService = inject(SemanticModelService)
  private settingsService = inject(NxSettingsPanelService)
  private route = inject(ActivatedRoute)
  private router = inject(Router)

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.modelService.store,
    { name: 'semantic_model_dimension', arrayKey: '__id__' },
    withProps<PropertyDimension>(null)
  )
  readonly pristineStore = createSubStore(
    this.modelService.pristineStore,
    { name: 'semantic_model_dimension_pristine', arrayKey: '__id__' },
    withProps<PropertyDimension>(null)
  )
  // readonly #stateHistory = stateHistory<Store, PropertyDimension>(this.store, {
  //   comparatorFn: negate(isEqual)
  // })
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  // readonly dimensionDirty = this.dirtyCheckResult.dirty
  // readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)
  readonly dimension$ = this.store.pipe(
    select((state) => state),
    filter(nonNullable)
  )

  readonly dirty = signal<Record<string, boolean>>({})

  // private dirtyCheckQuery: DirtyCheckQuery = new DirtyCheckQuery(this, {
  //   watchProperty: ['dimension'],
  //   clean: (head, current) => {
  //     return of(true)
  //   }
  // })
  // public dirty$ = this.dirtyCheckQuery.isDirty$

  // Query
  // public readonly dimension$ = this.select((state) => state.dimension).pipe(filter(nonNullable))
  public readonly name$ = this.dimension$.pipe(
    map((dimension) => dimension?.name),
    distinctUntilChanged()
  )
  public readonly hierarchies$ = this.dimension$.pipe(map((dimension) => dimension?.hierarchies))
  // public readonly currentHierarchy$ = this.select((state) => state.currentHierarchy)

  public readonly dimEntityService$ = this.name$.pipe(
    filter(nonBlank),
    switchMap((dimensionName) =>
      this.modelService.originalDataSource$.pipe(
        filter((dataSource) => !!dataSource),
        map((dataSource) => dataSource.createEntityService(dimensionName))
      )
    ),
    shareReplay(1)
  )

  readonly dimension = toSignal(this.dimension$)
  readonly hierarchies = computed(() => this.dimension()?.hierarchies)
  readonly currentHierarchy = signal(null)
  readonly currentHierarchyIndex = computed(() => {
    const id = this.currentHierarchy()
    const index = this.hierarchies()?.findIndex((item) => item.__id__ === id)
    return index
  })

  #dimensionSub = this.dimension$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((dimension) => {
    if (this.modelService.originalDataSource) {
      const schema = this.modelService.originalDataSource.options.schema
      const dimensions = schema?.dimensions ? [...schema.dimensions] : []
      const index = dimensions.findIndex((item) => item.name === dimension.name)
      if (index > -1) {
        dimensions.splice(index, 1, dimension)
      } else {
        dimensions.push(dimension)
      }
      this.modelService.originalDataSource?.setSchema({
        ...schema,
        dimensions
      })
    }
  })

  constructor() {
    effect(
      () => {
        this.modelService.updateDirty(this.store.value.__id__, this.dirtyCheckResult.dirty())
      },
      { allowSignalWrites: true }
    )
  }

  public init(id: string) {
    const state = this.store.connect(['draft', 'schema', 'dimensions', id]).getValue()
    if (!state.__id__) {
      this.router.navigate(['../404'], { relativeTo: this.route })
      return
    }
    this.pristineStore.connect(['draft', 'schema', 'dimensions', id])

    timer(0).subscribe(() => {
      this.initHierarchyIndex()
    })

    // this.dirtyCheckResult.setHead()

    // this.connect(this.modelService, { parent: ['dimensions', id] })
    //   .pipe(takeUntilDestroyed(this.#destroyRef))
    //   .subscribe(() => {
    //     // this.dirtyCheckQuery.setHead()
    //     this.initHierarchyIndex()
    //   })

    // this.modelService.saved$.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe(() => {
    // this.dirtyCheckQuery.setHead()
    // this.dirtyCheckResult.setHead()
    // })
  }

  /**
   * 可以被下级页面调用设置当前 Hierarchy
   */
  setCurrentHierarchy(id: string) {
    this.currentHierarchy.set(id)
  }

  /**
   * 初始化下级 Hierarchy 页面初始页(在初始化状态后立即执行)
   *
   * 如果有被设置 `currentHierarchyIndex` 则取相应的 Hierarchy, 否则取第一个
   */
  initHierarchyIndex() {
    const currentHierarchyIndex = this.currentHierarchyIndex()
    let currentHierarchy: PropertyHierarchy
    if (currentHierarchyIndex > -1) {
      currentHierarchy = this.hierarchies()[currentHierarchyIndex]
    } else {
      currentHierarchy = this.hierarchies()?.[0]
    }

    currentHierarchy && this.navigateTo(currentHierarchy?.__id__)
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: PropertyDimension, ...params: OriginType[]) => PropertyDimension | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  public readonly newHierarchy = this.updater((state, nh?: Partial<PropertyHierarchy> | null) => {
    const id = nh?.__id__ ?? uuid()
    state.hierarchies.push({
      caption: `New Hierarchy`,
      ...(nh ?? {}),
      __id__: id
    } as PropertyHierarchy)

    this.navigateTo(id)
  })

  public readonly removeHierarchy = this.updater((state, key?: string) => {
    const hierarchyIndex = key
      ? state.hierarchies.findIndex((item) => item.__id__ === key)
      : this.currentHierarchyIndex()
    if (hierarchyIndex > -1) {
      state.hierarchies.splice(hierarchyIndex, 1)
    }

    // Navigate to the side one
    const index = hierarchyIndex > 0 ? hierarchyIndex - 1 : state.hierarchies.length - 1
    if (index > -1) {
      this.navigateTo(state.hierarchies[index].__id__)
    }
  })

  public readonly updateHierarchy = this.updater((state, hierarchy: PropertyHierarchy) => {
    const h = state.hierarchies.find((item) => item.__id__ === hierarchy.__id__)
    assign(h, hierarchy)
  })

  public readonly duplicateHierarchy = this.updater((state, key?: string) => {
    const h = state.hierarchies.find((item) => item.__id__ === key)
    const newHierarchy = cloneDeep(h)
    state.hierarchies.push({
      ...newHierarchy,
      __id__: uuid(),
      name: newHierarchy.name ? `${newHierarchy.name} copy` : 'Copy',
      caption: `${newHierarchy.caption ?? ''} Copy`
    })
  })

  readonly upsertHierarchy = this.updater((state, hierarchy: Partial<PropertyHierarchy>) => {
    const key = upsertHierarchy(state, hierarchy)
    // let key = null
    // const index = state.hierarchies.findIndex((item) => item.name === hierarchy.name)
    // if (index > -1) {
    //   state.hierarchies.splice(index, 1, {
    //     ...state.hierarchies[index],
    //     ...hierarchy
    //   })
    //   key = state.hierarchies[index].__id__
    // } else {
    //   state.hierarchies.push({ ...hierarchy, __id__: hierarchy.__id__ ?? uuid() } as PropertyHierarchy)
    //   key = state.hierarchies[state.hierarchies.length - 1].__id__
    // }
    this.navigateTo(key)
  })

  public readonly update = this.updater((state, d: PropertyDimension) => {
    assign(state, d)
  })

  readonly setupHierarchyDesigner = effectAction((origin$: Observable<string>) => {
    return origin$.pipe(
      withLatestFrom(this.dimension$),
      switchMap(([id, dimension]) => {
        const hierarchy = dimension.hierarchies?.find((item) => item.__id__ === id)
        return this.settingsService
          .openDesigner<{
            modeling: { hierarchy: PropertyHierarchy; dimension: PropertyDimension }
          }>(ModelDesignerType.hierarchy, { modeling: { hierarchy, dimension: omit(dimension, 'hierarchies') } }, id)
          .pipe(
            tap(({ modeling }) => {
              this.updateHierarchy({
                ...modeling.hierarchy,
                __id__: id
              })
              this.update(modeling.dimension)
            })
          )
      })
    )
  })

  navigateTo(id: string) {
    this.router.navigate([`hierarchy/${id}`], { relativeTo: this.route })
  }

  updateDirty(id: string, dirty: boolean) {
    this.dirty.update((state) => ({
      ...state,
      [id]: dirty
    }))
  }
}
