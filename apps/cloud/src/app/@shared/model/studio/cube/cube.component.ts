import { Dialog } from '@angular/cdk/dialog'
import { DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, ViewContainerRef } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { suuid } from '@cloud/app/@core'
import { EFConnectionType, EFMarkerType, FFlowModule } from '@foblex/flow'
import { attrModel } from '@metad/ocap-angular/core'
import { NgmCalculationEditorComponent } from '@metad/ocap-angular/entity'
import {
  CalculatedMember,
  CalculationProperty,
  Cube,
  DeepPartial,
  DimensionUsage,
  isEntityType,
  ParameterProperty,
  PropertyDimension,
  PropertyMeasure,
  Syntax
} from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { filter, switchMap } from 'rxjs'
import { ModelStudioService } from '../../model.service'
import { CubeStudioContextManuComponent } from '../context-menu/menu.component'
import { CubeStudioComponent } from '../studio.component'
import { TCubeNode } from '../types'
import { CubeStudioCalculatedSettingsComponent } from './calculated/calculated.component'
import { CubeStudioDimensionSettingsComponent } from './dimension/dimension.component'
import { CubeStudioMeasureSettingsComponent } from './measure/measure.component'
import { CubeStudioCubeSettingsComponent } from './settings/settings.component'
import { CubeStudioDimensionUsageComponent } from './usage/usage.component'
import { MatDialog } from '@angular/material/dialog'
import { NgmParameterCreateComponent } from '@metad/ocap-angular/parameter'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-cube',
  templateUrl: 'cube.component.html',
  styleUrls: ['cube.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    DragDropModule,
    FFlowModule,
    TranslateModule,
    MatTooltipModule,
    CubeStudioCubeSettingsComponent,
    CubeStudioDimensionUsageComponent,
    CubeStudioDimensionSettingsComponent,
    CubeStudioMeasureSettingsComponent,
    CubeStudioCalculatedSettingsComponent,
    CubeStudioContextManuComponent
  ],
  host: {
    class: 'xp-cube-studio-cube'
  }
})
export class CubeStudioCubeComponent {
  eEFConnectionType = EFConnectionType
  eMarkerType = EFMarkerType

  readonly studio = inject(CubeStudioComponent)
  readonly studioService = inject(ModelStudioService)
  readonly #dialog = inject(Dialog)
  /**
   * @deprecated use `#dialog`
   */
  readonly _dialog = inject(MatDialog)
  readonly #vcr = inject(ViewContainerRef)

  // Inputs
  readonly node = input<TCubeNode>()

  // States
  readonly cube = computed(() => this.node()?.data as Cube)
  readonly caption = computed(() => this.cube()?.caption || this.cube()?.name || '')
  readonly dimensions = computed(() => this.cube()?.dimensions || [])
  readonly dimensionUsages = computed(() => this.cube()?.dimensionUsages || [])
  readonly measures = computed(() => this.cube()?.measures || [])
  readonly calculatedMembers = computed(() => this.cube()?.calculatedMembers || [])
  readonly calculations = computed(() => this.cube()?.calculations || [])
  readonly parameters = computed(() => this.cube()?.parameters || [])
  readonly cubeName = computed(() => this.cube()?.name)

  readonly _cube = this.studio.cube
  readonly _calculations = attrModel(this._cube, 'calculations')
  readonly _parameters = attrModel(this._cube, 'parameters')

  readonly semanticModelKey = toSignal(this.studioService.semanticModelKey$)
  readonly entityType = derivedAsync(() => {
    return this.cubeName()
      ? this.studioService.dataSource$.pipe(
          filter((dataSource) => !!dataSource),
          switchMap((dataSource) => dataSource.selectEntityType(this.cubeName())),
          filter((entityType) => isEntityType(entityType))
        )
      : null
  })
  readonly dataSettings = computed(() => ({ dataSource: this.semanticModelKey(), entitySet: this.cubeName() }))

  // constructor() {
  //   effect(() => {
  //     console.log(this.node())
  //   })
  // }

  addDimension() {
    this._cube.update((cube) => {
      return {
        ...cube,
        dimensions: [
          ...(cube.dimensions || []),
          { __id__: suuid(), name: '', caption: '', visible: true, description: '' }
        ]
      }
    })
  }

  upDimensionUsage(index: number) {
    this._cube.update((cube) => {
      const dimensionUsages = [...(cube.dimensionUsages || [])]
      moveItemInArray(dimensionUsages, index, index - 1)
      return { ...cube, dimensionUsages }
    })
  }

  downDimensionUsage(index: number) {
    this._cube.update((cube) => {
      const dimensionUsages = [...(cube.dimensionUsages || [])]
      moveItemInArray(dimensionUsages, index, index + 1)
      return { ...cube, dimensionUsages }
    })
  }

  onUsageChange(usage: DimensionUsage) {
    this._cube.update((cube) => {
      const dimensionUsages = [...cube.dimensionUsages]
      const index = dimensionUsages.findIndex((d) => d.__id__ === usage.__id__)
      if (index > -1) {
        dimensionUsages[index] = usage
      } else {
        dimensionUsages.push(usage)
      }
      return { ...cube, dimensionUsages }
    })
  }

  removeDimensionUsage(usage: DimensionUsage) {
    this._cube.update((cube) => {
      const dimensionUsages = cube.dimensionUsages.filter((d) => d.__id__ !== usage.__id__)
      return { ...cube, dimensionUsages }
    })
  }

  upDimension(index: number) {
    this._cube.update((cube) => {
      const dimensions = [...(cube.dimensions || [])]
      moveItemInArray(dimensions, index, index - 1)
      return { ...cube, dimensions }
    })
  }

  downDimension(index: number) {
    this._cube.update((cube) => {
      const dimensions = [...(cube.dimensions || [])]
      moveItemInArray(dimensions, index, index + 1)
      return { ...cube, dimensions }
    })
  }

  onDimensionChange(dimension: PropertyDimension) {
    this._cube.update((cube) => {
      const dimensions = [...cube.dimensions]
      const index = dimensions.findIndex((d) => d.__id__ === dimension.__id__)
      if (index > -1) {
        dimensions[index] = dimension
      } else {
        dimensions.push(dimension)
      }
      return { ...cube, dimensions }
    })
  }

  removeDimension(dimension: PropertyDimension) {
    this._cube.update((cube) => {
      const dimensions = cube.dimensions.filter((d) => d.__id__ !== dimension.__id__)
      return { ...cube, dimensions }
    })
  }

  upMeasure(index: number) {
    this._cube.update((cube) => {
      const measures = [...(cube.measures || [])]
      moveItemInArray(measures, index, index - 1)
      return { ...cube, measures }
    })
  }

  downMeasure(index: number) {
    this._cube.update((cube) => {
      const measures = [...(cube.measures || [])]
      moveItemInArray(measures, index, index + 1)
      return { ...cube, measures }
    })
  }

  onMeasureChange(measure: PropertyMeasure) {
    this._cube.update((cube) => {
      const measures = [...cube.measures]
      const index = measures.findIndex((m) => m.__id__ === measure.__id__)
      if (index > -1) {
        measures[index] = measure
      } else {
        measures.push(measure)
      }
      return { ...cube, measures }
    })
  }

  removeMeasure(measure: PropertyMeasure) {
    this._cube.update((cube) => {
      const measures = cube.measures.filter((m) => m.__id__ !== measure.__id__)
      return { ...cube, measures }
    })
  }

  // Calculated measures methods
  upCalculated(index: number) {
    this._cube.update((cube) => {
      const calculatedMembers = [...(cube.calculatedMembers || [])]
      moveItemInArray(calculatedMembers, index, index - 1)
      return { ...cube, calculatedMembers }
    })
  }
  downCalculated(index: number) {
    this._cube.update((cube) => {
      const calculatedMembers = [...(cube.calculatedMembers || [])]
      moveItemInArray(calculatedMembers, index, index + 1)
      return { ...cube, calculatedMembers }
    })
  }

  onCalculatedChange(calculated: CalculatedMember) {
    this._cube.update((cube) => {
      const calculatedMembers = [...cube.calculatedMembers]
      const index = calculatedMembers.findIndex((c) => c.__id__ === calculated.__id__)
      if (index > -1) {
        calculatedMembers[index] = calculated
      } else {
        calculatedMembers.push(calculated)
      }
      return { ...cube, calculatedMembers }
    })
  }

  removeCalculated(calculated: CalculatedMember) {
    this._cube.update((cube) => {
      const calculatedMembers = cube.calculatedMembers.filter((c) => c.__id__ !== calculated.__id__)
      return { ...cube, calculatedMembers }
    })
  }

  // Calculation methods
  upCalculation(index: number) {
    this._calculations.update((state) => {
      const calculations = [...state]
      moveItemInArray(calculations, index, index - 1)
      return calculations
    })
  }
  downCalculation(index: number) {
    this._calculations.update((state) => {
      const calculations = [...state]
      moveItemInArray(calculations, index, index + 1)
      return calculations
    })
  }

  openCalculation(calculation: CalculationProperty) {
    this.#dialog
      .open<CalculationProperty>(NgmCalculationEditorComponent, {
        viewContainerRef: this.#vcr,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          syntax: Syntax.MDX,
          value: calculation
        }
      })
      .closed.subscribe({
        next: (value) => {
          if (value) {
            this.onCalculationChange(value)
          }
        }
      })
  }

  onCalculationChange(calculated: CalculationProperty) {
    this._calculations.update((state) => {
      const calculations = [...state]
      const index = calculations.findIndex((c) => c.__id__ === calculated.__id__)
      if (index > -1) {
        calculations[index] = { ...calculated }
      } else {
        calculations.push({ ...calculated })
      }
      return calculations
    })
  }

  removeCalculation(calculated: CalculationProperty) {
    this._calculations.update((state) => {
      return state.filter((c) => c.__id__ !== calculated.__id__)
    })
  }

  // Parameter methods
  onEditParameter(member?: Partial<ParameterProperty>) {
    this._dialog
      .open(NgmParameterCreateComponent, {
        viewContainerRef: this.#vcr,
        data: {
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          name: member?.name
        }
      })
      .afterClosed().subscribe((result: DeepPartial<ParameterProperty>) => {
        console.log(result)
      })
  }
  upParameter(index: number) {
    this._parameters.update((state) => {
      const parameters = [...state]
      moveItemInArray(parameters, index, index - 1)
      return parameters
    })
  }
  downParameter(index: number) {
    this._parameters.update((state) => {
      const parameters = [...state]
      moveItemInArray(parameters, index, index + 1)
      return parameters
    })
  }

}
