import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { EFConnectionType, EFMarkerType, FFlowModule } from '@foblex/flow'
import { linkedModel } from '@metad/ocap-angular/core'
import { DimensionUsage, Schema } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { CubeStudioComponent, TCubeNode } from '../studio.component'
import { CubeStudioHierarchyComponent } from '../hierarchy/hierarchy.component'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-shared-dimension',
  templateUrl: 'shared-dimension.component.html',
  styleUrls: ['shared-dimension.component.scss'],
  imports: [CommonModule, FormsModule, CdkMenuModule, FFlowModule, TranslateModule, CubeStudioHierarchyComponent],
  host: {
    class: 'xp-cube-studio-shared-dimension'
  }
})
export class CubeStudioSharedDimensionComponent {
  eEFConnectionType = EFConnectionType
  eMarkerType = EFMarkerType

  readonly studio = inject(CubeStudioComponent)

  // Inputs
  readonly node = input<TCubeNode<DimensionUsage>>()

  // Global states
  readonly schema = this.studio.schema

  // States
  readonly dimensionUsage = computed(() => this.node()?.data as DimensionUsage)
  readonly sourceName = computed(() => this.dimensionUsage()?.source)
  readonly caption = computed(() => this.dimensionUsage()?.caption || this.dimensionUsage()?.name || '')

  readonly dimension = linkedModel({
    initialValue: null,
    compute: () => {
      return this.studio.draft()?.schema?.dimensions?.find((_) => _.name === this.sourceName())
    },
    update: (dimension) => {
      if (dimension) {
        this.studio.draft.update((draft) => {
          const schema = draft.schema || ({ cubes: [] } as Schema)
          schema.dimensions = schema.dimensions ? [...schema.dimensions] : []
          const index = schema.dimensions.findIndex((c) => c.__id__ === dimension.__id__)
          if (index > -1) {
            schema.dimensions[index] = dimension
          } else {
            schema.dimensions.push(dimension)
          }
          return { ...draft, schema: { ...schema } }
        })
      }
    }
  })

  readonly hierarchy = linkedModel({
    initialValue: null,
    compute: () => this.dimension()?.hierarchies[0],
    update: (hierarchy) => {
      if (hierarchy) {
        this.dimension.update((dimension) => {
          const hierarchies = dimension.hierarchies ? [...dimension.hierarchies] : []
          const index = hierarchies.findIndex((h) => h.__id__ === hierarchy.__id__)
          if (index > -1) {
            hierarchies[index] = hierarchy
          } else {
            hierarchies.push(hierarchy)
          }
          return { ...dimension, hierarchies }
        })
      }
    }
  })

  constructor() {
    effect(() => {
      // console.log(this.dimension(), this.dimensionUsage(), this.hierarchies(), this.levels())
    })
  }
}
