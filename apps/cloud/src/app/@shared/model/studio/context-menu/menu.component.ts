import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { suuid } from '@cloud/app/@core'
import { attrModel } from '@metad/ocap-angular/core'
import { PropertyDimension } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { CubeStudioComponent } from '../studio.component'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio-context-menu',
  templateUrl: 'menu.component.html',
  styleUrls: ['menu.component.scss'],
  imports: [CommonModule, FormsModule, TranslateModule, CdkMenuModule],
  host: {
    class: 'xp-cube-studio-context-menu'
  }
})
export class CubeStudioContextMenuComponent {
  readonly studioComponent = inject(CubeStudioComponent)

  readonly cube = this.studioComponent.cube
  readonly schema = this.studioComponent.schema
  readonly sharedDimensions = computed(() => this.schema()?.dimensions)
  readonly calculations = attrModel(this.studioComponent.cube, 'calculations')

  readonly dataSettings = this.studioComponent.dataSettings
  readonly entityType = this.studioComponent.entityType

  addSharedDimension(dimension: PropertyDimension) {
    this.cube.update((cube) => {
      const dimensionUsages = cube.dimensionUsages ? [...cube.dimensionUsages] : []
      dimensionUsages.push({
        __id__: suuid(),
        name: '',
        caption: '',
        source: dimension.name,
        foreignKey: ''
      })
      return { ...cube, dimensionUsages }
    })
  }

  addInlineDimension() {
    this.cube.update((cube) => {
      const dimensions = cube.dimensions ? [...cube.dimensions] : []
      dimensions.push({
        __id__: suuid(),
        name: '',
        caption: '',
        description: '',
        hierarchies: []
      })
      return { ...cube, dimensions }
    })
  }

  addMeasure() {
    this.cube.update((cube) => {
      const measures = cube.measures ? [...cube.measures] : []
      measures.push({
        __id__: suuid(),
        name: '',
        caption: '',
        description: ''
      })
      return { ...cube, measures }
    })
  }

  addCalculatedMember() {
    this.cube.update((cube) => {
      const calculatedMembers = cube.calculatedMembers ? [...cube.calculatedMembers] : []
      calculatedMembers.push({
        __id__: suuid(),
        name: '',
        caption: '',
        description: '',
        formula: ''
      })
      return { ...cube, calculatedMembers }
    })
  }

  onCreateCalculation() {
    this.studioComponent.onEditCalculation()
  }

  onCreateParameter() {
    this.studioComponent.onEditParameter()
  }
}
