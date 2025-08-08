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
  selector: 'xp-cube-studio-inline-dimension',
  templateUrl: 'inline-dimension.component.html',
  styleUrls: ['inline-dimension.component.scss'],
  imports: [CommonModule, FormsModule, CdkMenuModule, FFlowModule, TranslateModule, CubeStudioHierarchyComponent],
  host: {
    class: 'xp-cube-studio-inline-dimension'
  }
})
export class CubeStudioInlineDimensionComponent {
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
    compute: () => this.studio.cube()?.dimensions?.find((_) => _.__id__ === this.dimensionKey()),
    update: (dimension) => {
      if (dimension) {
        this.studio.cube.update((cube) => {
          const dimensions = [...cube.dimensions]
          const index = dimensions.findIndex((c) => c.__id__ === dimension.__id__)
          if (index > -1) {
            dimensions[index] = dimension
          } else {
            dimensions.push(dimension)
          }
          return { ...cube, dimensions }
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
      // console.log('Inline Dimension', this.hierarchyKey(), this.dimension(), this.hierarchy())
    })
  }

  remove() {
    this.dimension.update((dimension) => {
      const hierarchies = dimension.hierarchies.filter((h) => h.__id__ !== this.hierarchyKey())
      return { ...dimension, hierarchies }
    })
  }
}
