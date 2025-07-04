import { Injectable, computed, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  BusinessAreasService,
  Indicator,
  IndicatorsService,
  NgmSemanticModel,
  TagCategoryEnum,
  convertIndicatorResult,
  hierarchizeBusinessAreas
} from '@metad/cloud/state'
import { dirtyCheckWith, nonBlank } from '@metad/core'
import { NgmDSCoreService } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { MDCube, isEntitySet, isEqual, negate, nonNullable } from '@metad/ocap-core'
import { Store, createStore, withProps } from '@ngneat/elf'
import { stateHistory } from '@ngneat/elf-state-history'
import { cloneDeep } from 'lodash-es'
import {
  EMPTY,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  firstValueFrom,
  map,
  of,
  shareReplay,
  startWith,
  switchMap,
  take,
  tap
} from 'rxjs'
import {
  IProject,
  ISemanticModel,
  ProjectsService,
  TagService,
  ToastrService,
  isUUID,
  registerModel
} from '../../@core'
import { NewIndicatorCodePlaceholder, ProjectIndicatorsState, injectFetchModelDetails } from './types'

@Injectable()
export class ProjectService {
  readonly projectsService = inject(ProjectsService)
  readonly indicatorsService = inject(IndicatorsService)
  readonly businessAreasStore = inject(BusinessAreasService)
  readonly tagService = inject(TagService)
  readonly dsCoreService = inject(NgmDSCoreService)
  readonly wasmAgent = inject(WasmAgentService)
  readonly toastrService = inject(ToastrService)
  readonly fetchModelDetails = injectFetchModelDetails()

  readonly project = signal<IProject>(null)

  readonly project$ = toObservable(this.project)

  readonly models = computed(() => this.project()?.models)
  readonly models$ = toObservable(this.models)
  readonly dataSources = computed(() =>
    this.models()?.map((model) => ({
      key: model.key,
      caption: model.name,
      value: model.id
    }))
  )

  readonly modelDetails = signal<Record<string, ISemanticModel>>({})

  readonly modelCubes$ = this.models$.pipe(
    filter(nonNullable),
    tap(async (models) => {
      for await (const model of models) {
        await this.registerModel(model.key)
      }
    }),
    switchMap((models) =>
      combineLatest(
        models.map((model) =>
          this.selectDataSource(model.key).pipe(
            switchMap((dataSource) => dataSource.discoverMDCubes()),
            catchError((err) => {
              console.group('Project')
              console.error('Error fetching cubes in project:')
              console.error(err)
              console.groupEnd()
              return EMPTY
            }),
            startWith([] as MDCube[])
          )
        )
      ).pipe(map((cubess) => cubess.map((cubes, index) => ({ ...models[index], cubes }))))
    ),
    shareReplay(1)
  )

  /**
   * Indicators
   */
  readonly iStore = createStore({ name: 'project_indicators' }, withProps<ProjectIndicatorsState>({ indicators: [] }))
  readonly iPristineStore = createStore(
    { name: 'project_indicators_pristine' },
    withProps<ProjectIndicatorsState>({ indicators: [] })
  )
  readonly #stateHistory = stateHistory<Store, ProjectIndicatorsState>(this.iStore, {
    comparatorFn: negate(isEqual)
  })
  readonly dirtyCheckResult = dirtyCheckWith(this.iStore, this.iPristineStore, { comparator: negate(isEqual) })
  readonly indicators$ = this.iStore.pipe(map((state) => state.indicators))
  readonly indicators = toSignal(this.indicators$)

  readonly dirty = signal<Record<string, boolean>>({})
  readonly hasDirty = computed(() => Object.values(this.dirty()).some((dirty) => dirty))
  readonly loading = signal(false)

  /**
   * Business Areas
   */
  readonly businessAreas = toSignal(this.businessAreasStore.getMy().pipe(startWith([])))
  readonly businessAreasTree = computed(() => hierarchizeBusinessAreas(this.businessAreas()))

  /**
   * Tags
   */
  readonly tags = toSignal(this.tagService.getAllByCategory(TagCategoryEnum.INDICATOR), { initialValue: [] })

  // constructor() {
  //   effect(() => {
  //     console.log(this.hasDirty(), this.dirty())
  //   })
  // }

  setProject(project: IProject) {
    this.project.set(project)
    const indicators = project.indicators.map(convertIndicatorResult)
    this.iStore.update(() => ({ indicators: cloneDeep(indicators) }))
    this.iPristineStore.update(() => ({ indicators: cloneDeep(indicators) }))
  }

  updateProject(project: Partial<IProject>): void
  updateProject(updateFn: (value: IProject) => IProject): void
  updateProject(project: Partial<IProject> | ((value: IProject) => IProject)) {
    if (typeof project === 'function') {
      this.project.update(project)
    } else {
      this.project.update((prev) => ({ ...prev, ...project }))
    }
  }

  async registerModel(modelKey: string) {
    if (modelKey && !this.modelDetails()[modelKey]) {
      const semanticModel = await firstValueFrom(
        this.fetchModelDetails(this.models().find((item) => item.key === modelKey).id)
      )

      registerModel(semanticModel as NgmSemanticModel, false, this.dsCoreService, this.wasmAgent)
    }
  }

  /**
  |--------------------------------------------------------------------------
  | Selectors
  |--------------------------------------------------------------------------
  */
  selectDataSource(dataSource: string) {
    return this.dsCoreService.getDataSource(dataSource)
  }
  selectEntityType(dataSource: string, cube: string) {
    return this.selectDataSource(dataSource).pipe(
      switchMap((dataSource) => dataSource.selectEntitySet(cube)),
      map((entitySet) => {
        if (isEntitySet(entitySet)) {
          return entitySet.entityType
        } else {
          console.error('EntitySet not found', entitySet)
          throw entitySet
        }
      })
    )
  }

  /**
  |--------------------------------------------------------------------------
  | Indicators
  |--------------------------------------------------------------------------
  */
  upsertIndicator(indicator: Indicator) {
    const index = this.indicators().findIndex((item) => item.id === indicator.id)
    if (index > -1) {
      this.updateIndicator(indicator)
    } else {
      this.addIndicator(indicator)
    }
  }

  addIndicator(indicator: Partial<Indicator>) {
    this.iStore.update((state) => {
      const index = state.indicators.findIndex((item) => item.id === indicator.id)
      // If indicator already exists, don't add it
      if (index > -1) {
        throw new Error(`Indicator with id ${indicator.id} already exists`)
      }
      return {
        ...state,
        indicators: [indicator, ...state.indicators]
      }
    })
  }

  newIndicator() {
    const exists = this.indicators().some((item) => item.id === NewIndicatorCodePlaceholder)
    if (!exists) {
      this.addIndicator({
        visible: true,
        isActive: true,
        createdAt: new Date(),
        id: NewIndicatorCodePlaceholder
      } as Indicator)
    }
  }

  refreshIndicators() {
    this.projectsService
      .getOne(this.project().id ?? null, ['indicators', 'indicators.businessArea'])
      .subscribe((project) => {
        this.updateProject({
          indicators: project.indicators
        })
      })
  }

  getIndicatorByCode(code: string) {
    return this.indicators$.pipe(
      map((indicators) => indicators.find((indicator) => indicator.code === code)),
      distinctUntilChanged(),
      switchMap((indicator) =>
        indicator
          ? of(indicator)
          : this.project$.pipe(
              map((project) => project?.id),
              filter(nonBlank),
              take<string>(1),
              switchMap((projectId) =>
                this.indicatorsService.getByProject(projectId, { where: { code }, relations: ['createdBy'] })
              ),
              map(({ items }) => items[0]),
              catchError(() => of(null))
            )
      )
    )
  }

  getIndicatorById(id: string) {
    return this.indicatorsService.getById(id, ['createdBy'])
  }

  updateIndicator(indicator: Partial<Indicator>) {
    if (indicator.id) {
      this.iStore.update((state) => ({
        ...state,
        indicators: state.indicators.map((item) => (item.id === indicator.id ? { ...item, ...indicator } : item))
      }))
    }
  }

  markDirty(id: string, dirty: boolean) {
    this.dirty.update((state) => ({ ...state, [id]: dirty }))
  }

  resetIndicator(id: string) {
    if (isUUID(id)) {
      this.iStore.update((state) => ({
        ...state,
        indicators: state.indicators.map((item) =>
          item.id === id ? cloneDeep(this.iPristineStore.getValue().indicators.find((i) => i.id === id)) : item
        )
      }))
      this.dirty.update((state) => ({ ...state, [id]: null }))
    } else {
      this.removeIndicator(id)
    }
  }

  replaceNewIndicator(id: string, indicator: Indicator) {
    const update = (state) => {
      const indicators = [...state.indicators]
      const index = state.indicators.findIndex((item) => item.id === id)
      if (index > -1) {
        indicators.splice(index, 1, cloneDeep(indicator))
      } else {
        indicators.push(cloneDeep(indicator))
      }

      return { ...state, indicators }
    }
    this.iStore.update(update)
    this.iPristineStore.update(update)
  }

  removeIndicator(id: string) {
    this.dirty.update((state) => ({ ...state, [id]: null }))
    this.iStore.update((store) => ({
      ...store,
      indicators: store.indicators.filter((item) => item.id !== id)
    }))
  }

  deleteIndicators(ids: string[]) {
    return combineLatest(ids.map((id) => this.indicatorsService.delete(id).pipe(tap(() => this.removeIndicator(id)))))
  }
}
