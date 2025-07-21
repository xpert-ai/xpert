import { DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { suuid } from '@cloud/app/@core'
import { EFConnectionType, EFMarkerType, FFlowModule } from '@foblex/flow'
import { CalculatedMember, Cube, DimensionUsage, PropertyDimension, PropertyMeasure } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { CubeStudioComponent } from '../studio.component'
import { CubeStudioDimensionUsageComponent } from './usage/usage.component'
import { CubeStudioDimensionSettingsComponent } from './dimension/dimension.component'
import { CubeStudioMeasureSettingsComponent } from './measure/measure.component'
import { CubeStudioCubeSettingsComponent } from './settings/settings.component'
import { CubeStudioCalculatedSettingsComponent } from './calculated/calculated.component'
import { CubeStudioContextManuComponent } from '../context-menu/menu.component'
import { TCubeNode } from '../types'


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

  // Inputs
  readonly node = input<TCubeNode>()

  // States
  readonly cube = computed(() => this.node()?.data as Cube)
  readonly caption = computed(() => this.cube()?.caption || this.cube()?.name || '')
  readonly dimensions = computed(() => this.cube()?.dimensions || [])
  readonly dimensionUsages = computed(() => this.cube()?.dimensionUsages || [])
  readonly measures = computed(() => this.cube()?.measures || [])
  readonly calculatedMembers = computed(() => this.cube()?.calculatedMembers || [])

  readonly _cube = this.studio.cube

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
      const dimensionUsages = cube.dimensionUsages.filter(d => d.__id__ !== usage.__id__)
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
      const dimensions = cube.dimensions.filter(d => d.__id__ !== dimension.__id__)
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
      const measures = cube.measures.filter(m => m.__id__ !== measure.__id__)
      return { ...cube, measures }
    })
  }

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
      const calculatedMembers = cube.calculatedMembers.filter(c => c.__id__ !== calculated.__id__)
      return { ...cube, calculatedMembers }
    })
  }
}
