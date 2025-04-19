import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop'
import { Injectable, inject } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MDX, TVirtualCube } from '@cloud/app/@core/types'
import { Property, PropertyMeasure } from '@metad/ocap-core'
import { select, withProps } from '@ngneat/elf'
import { ToastrService } from 'apps/cloud/src/app/@core'
import { isEqual, negate, remove } from 'lodash-es'
import { createSubStore, dirtyCheckWith, write } from '../../store'
import { SemanticModelService } from '../model.service'

@Injectable()
export class VirtualCubeStateService {
  readonly modelService = inject(SemanticModelService)
  readonly #toastrService = inject(ToastrService)
  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.modelService.store,
    { name: 'semantic_model_virtual_cube', arrayKey: '__id__' },
    withProps<TVirtualCube>(null)
  )
  readonly pristineStore = createSubStore(
    this.modelService.pristineStore,
    { name: 'semantic_model_virtual_cube_pristine', arrayKey: '__id__' },
    withProps<TVirtualCube>(null)
  )
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)

  public readonly virtualCube$ = this.store
  public readonly cubes$ = this.store.pipe(select((state) => state.cubeUsages))
  public readonly dimensions$ = this.store.pipe(select((state) => state.virtualCubeDimensions))
  public readonly measures$ = this.store.pipe(select((state) => state.virtualCubeMeasures))
  public readonly calculatedMembers$ = this.store.pipe(select((state) => state.calculatedMembers))

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly virtualCube = toSignal(this.store)

  init(key: string) {
    // this.connect(this.modelService, { parent: ['model', 'schema', 'virtualCubes', key], arrayKey: '__id__' })
    this.store.connect(['model', 'schema', 'virtualCubes', key])
    this.pristineStore.connect(['model', 'schema', 'virtualCubes', key])
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: TVirtualCube, ...params: OriginType[]) => TVirtualCube | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  patchState(vCube: TVirtualCube) {
    this.store.update((state) => ({
      ...state,
      ...vCube
    }))
  }

  readonly addCube = this.updater((state, { index, cubeName }: { index: number; cubeName: string }) => {
    state.cubeUsages = state.cubeUsages ?? []
    if (state.cubeUsages.find((item) => item.cubeName === cubeName)) {
      this.#toastrService.warning('PAC.MODEL.VirtualCube.CubeAlreadyExists', { Default: 'Cube already exists!' })
    } else {
      state.cubeUsages.splice(index, 0, {
        cubeName,
        ignoreUnrelatedDimensions: null
      })
    }
  })

  readonly updateCube = this.updater((state, entity: Partial<MDX.CubeUsage>) => {
    const index = state.cubeUsages.findIndex((item) => item.cubeName === entity.cubeName)
    if (index > -1) {
      state.cubeUsages[index] = {
        ...state.cubeUsages[index],
        ...entity
      }
    }
  })

  readonly removeCube = this.updater((state, name: string) => {
    remove(state.cubeUsages, (item) => item.cubeName === name)
  })

  readonly moveItemInCubes = this.updater((state, event: CdkDragDrop<any[]>) => {
    moveItemInArray(state.cubeUsages, event.previousIndex, event.currentIndex)
  })

  readonly addDimension = this.updater((state, { index, dimension }: { index: number; dimension: Property }) => {
    state.virtualCubeDimensions = state.virtualCubeDimensions ?? []
    const dimensionName = (dimension as any).dimensionName
    if (state.virtualCubeDimensions.find((item) => item.name === dimensionName)) {
      this.#toastrService.warning('PAC.MODEL.VirtualCube.DimensionAlreadyExists', {
        Default: 'Dimension already exists!'
      })
    } else {
      state.virtualCubeDimensions.splice(index, 0, {
        name: dimensionName,
        label: dimension.caption,
        caption: dimension.caption,
        cubeName: dimension.entity
      })
    }
  })

  readonly updateDimension = this.updater((state, entity: Partial<MDX.VirtualCubeDimension>) => {
    const index = state.virtualCubeDimensions.findIndex((item) => item.name === entity.name)
    if (index > -1) {
      state.virtualCubeDimensions[index] = {
        ...state.virtualCubeDimensions[index],
        ...entity
      }
    }
  })

  readonly removeDimension = this.updater((state, name: string) => {
    remove(state.virtualCubeDimensions, (item) => item.name === name)
  })

  readonly moveItemInDimensions = this.updater((state, event: CdkDragDrop<any[]>) => {
    moveItemInArray(state.virtualCubeDimensions, event.previousIndex, event.currentIndex)
  })

  readonly addMeasure = this.updater((state, { index, measure }: { index: number; measure: PropertyMeasure }) => {
    state.virtualCubeMeasures = state.virtualCubeMeasures ?? []
    if (state.virtualCubeMeasures.find((item) => item.name === measure.uniqueName)) {
      this.#toastrService.warning('PAC.MODEL.VirtualCube.MeasureAlreadyExists', { Default: 'Measure already exists!' })
    } else {
      state.virtualCubeMeasures.splice(index, 0, {
        name: measure.uniqueName,
        label: measure.caption,
        caption: measure.caption,
        cubeName: measure.entity,
        visible: true
      })
    }
  })

  readonly removeMeasure = this.updater((state, name: string) => {
    remove(state.virtualCubeMeasures, (item) => item.name === name)
  })

  readonly moveItemInMeasures = this.updater((state, event: CdkDragDrop<any[]>) => {
    moveItemInArray(state.virtualCubeMeasures, event.previousIndex, event.currentIndex)
  })

  readonly applyCalculatedMember = this.updater((state, member: MDX.CalculatedMember) => {
    state.calculatedMembers = state.calculatedMembers ?? []
    let index = state.calculatedMembers.findIndex((item) => item.name === member.name)
    if (index === -1) {
      index = state.calculatedMembers.length
    }
    state.calculatedMembers[index] = {
      ...member
    }
  })

  readonly removeCalculatedMember = this.updater((state, name: string) => {
    remove(state.calculatedMembers, (item) => item.name === name)
  })
}
