import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { suuid } from '@cloud/app/@core/types'
import { EFConnectionType, EFMarkerType, FFlowModule } from '@foblex/flow'
import { PropertyDimension, PropertyHierarchy, PropertyLevel } from '@metad/ocap-core'
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

  // Global states
  readonly schema = this.studio.schema
  // States
  readonly caption = computed(() => this.hierarchy()?.caption || this.hierarchy()?.name || '')
  readonly hierarchies = computed(() => this.dimension()?.hierarchies)

  readonly levels = computed(() => this.hierarchies()?.flatMap((h) => h.levels) || [])

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
}
