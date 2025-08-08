import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model, output } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { suuid } from '@cloud/app/@core/types'
import { EFConnectionType, EFMarkerType, FFlowModule } from '@foblex/flow'
import { nonNullable, PropertyDimension, PropertyHierarchy, PropertyLevel } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { CubeStudioComponent } from '../studio.component'
import { CubeStudioDimensionSettingsComponent } from './settings/settings.component'
import { CubeStudioDimensionLevelComponent } from './level/level.component'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-hierarchy',
  templateUrl: 'hierarchy.component.html',
  styleUrls: ['hierarchy.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    FFlowModule,
    TranslateModule,
    DragDropModule,
    CubeStudioDimensionSettingsComponent,
    CubeStudioDimensionLevelComponent
  ],
  host: {
    class: 'xp-cube-studio-hierarchy'
  }
})
export class CubeStudioHierarchyComponent {
  eEFConnectionType = EFConnectionType
  eMarkerType = EFMarkerType

  readonly studio = inject(CubeStudioComponent)

  // Inputs
  readonly dimension = model<PropertyDimension>()
  readonly hierarchy = model<PropertyHierarchy>()

  // Outputs
  readonly remove = output<void>()

  // Global states
  readonly schema = this.studio.schema
  // States
  readonly dimensionName = computed(() => this.dimension()?.name)
  readonly caption = computed(() => this.hierarchy()?.caption || this.hierarchy()?.name || this.dimensionName())
  readonly levels = computed(() => this.hierarchy()?.levels?.filter(nonNullable) || [])
  readonly hierarchyTable = computed(() => this.hierarchy()?.primaryKeyTable ?? this.hierarchy()?.tables?.[0]?.name)
  
  // constructor() {
  //   effect(() => {
  //     console.log(this.node())
  //   })
  // }

  addLevel() {
    this.hierarchy.update((hierarchy) => {
      const levels = [...(hierarchy.levels || [])]
      levels.push({
            __id__: suuid(),
            name: ''
          })
      return { ...hierarchy, levels }
    })
  }

  upLevel(index: number) {
    this.hierarchy.update((hierarchy) => {
      const levels = [...hierarchy.levels]
      moveItemInArray(levels, index, index - 1)
      return { ...hierarchy, levels }
    })
  }
  
  downLevel(index: number) {
    this.hierarchy.update((hierarchy) => {
      const levels = [...hierarchy.levels]
      moveItemInArray(levels, index, index + 1)
      return { ...hierarchy, levels }
    })
  }

  onLevelChange(level: PropertyLevel) {
    this.hierarchy.update((hierarchy) => {
      const levels = [...hierarchy.levels]
      const index = levels.findIndex((l) => l.__id__ === level.__id__)
      if (index !== -1) {
        levels[index] = level
      }
      return { ...hierarchy, levels }
    })
  }

  removeLevel(level: PropertyLevel) {
    this.hierarchy.update((hierarchy) => {
      const levels = hierarchy.levels.filter((l) => l.__id__ !== level.__id__)
      return { ...hierarchy, levels }
    })
  }
}
