import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { EFConnectionType, EFMarkerType, FFlowModule } from '@foblex/flow'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { CubeStudioComponent } from '../studio.component'
import { CubeStudioHierarchyComponent } from '../hierarchy/hierarchy.component'
import { TCubeNode, THierarchyNode } from '../types'

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
  readonly node = input<TCubeNode<THierarchyNode>>()

  // Global states
  readonly schema = this.studio.schema

  // States
  readonly hierarchyKey = computed(() => this.node()?.key)
  readonly dimensionKey = computed(() => this.node()?.data?.dimension)

  readonly dimension = linkedModel({
    initialValue: null,
    compute: () => {
      return this.studio.schema()?.dimensions?.find((_) => _.__id__ === this.dimensionKey())
    },
    update: (dimension) => {
      if (dimension) {
        this.studio.schema.update((schema) => {
          const dimensions = schema.dimensions ? [...schema.dimensions] : []
          const index = dimensions.findIndex((c) => c.__id__ === dimension.__id__)
          if (index > -1) {
            dimensions[index] = dimension
          } else {
            dimensions.push(dimension)
          }
          return { ...schema, dimensions }
        })
      }
    }
  })

  readonly hierarchy = linkedModel({
    initialValue: null,
    compute: () => this.dimension()?.hierarchies?.find((h) => h.__id__ === this.hierarchyKey()),
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
      // console.log(this.dimensionKey(), this.hierarchyKey())
    })
  }

  remove() {
    this.dimension.update((dimension) => {
      const hierarchies = dimension.hierarchies.filter((h) => h.__id__ !== this.hierarchyKey())
      return { ...dimension, hierarchies }
    })
  }
}
