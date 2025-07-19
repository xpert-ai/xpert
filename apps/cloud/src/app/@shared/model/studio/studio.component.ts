import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { IRect } from '@foblex/2d/rect'
import {
  EFConnectionType,
  EFMarkerType,
  FCanvasChangeEvent,
  FCanvasComponent,
  FFlowComponent,
  FFlowModule,
  FZoomDirective
} from '@foblex/flow'
import { SemanticModelServerService, TSemanticModelDraft } from '@metad/cloud/state'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { Schema } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { CubeStudioCubeComponent } from './cube/cube.component'
import { CubeStudioInlineDimensionComponent } from './inline-dimension/inline-dimension.component'
import { CubeStudioSharedDimensionComponent } from './shared-dimension/shared-dimension.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CubeStudioContextManuComponent } from './context-menu/menu.component'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'xp-cube-studio',
  templateUrl: 'studio.component.html',
  styleUrls: ['studio.component.scss'],
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    FFlowModule,
    TranslateModule,
    DragDropModule,
    CubeStudioCubeComponent,
    CubeStudioSharedDimensionComponent,
    CubeStudioInlineDimensionComponent,
    CubeStudioContextManuComponent
  ],
  host: {
    class: 'xp-cube-studio'
  },
  
})
export class CubeStudioComponent {
  eEFConnectionType = EFConnectionType
  eMarkerType = EFMarkerType

  readonly modelAPI = inject(SemanticModelServerService)
  readonly #cdr = inject(ChangeDetectorRef)

  // Inputs
  readonly draft = model<TSemanticModelDraft<Schema>>()
  readonly cubeName = input('')

  // Children
  readonly fFlowComponent = viewChild(FFlowComponent)
  readonly fCanvasComponent = viewChild(FCanvasComponent)
  readonly fZoom = viewChild(FZoomDirective)

  // States
  readonly cube = linkedModel({
    initialValue: null,
    compute: () => {
      return this.draft()?.schema?.cubes?.find((cube) => cube.name === this.cubeName())
    },
    update: (cube) => {
      if (cube) {
        this.draft.update((draft) => {
          const schema = draft.schema || ({ cubes: [] } as Schema)
          const existingCubeIndex = schema.cubes.findIndex((c) => c.name === cube.name)
          if (existingCubeIndex > -1) {
            schema.cubes[existingCubeIndex] = cube
          } else {
            schema.cubes.push(cube)
          }
          return { ...draft, schema }
        })
      }
    }
  })
  readonly schema = computed(() => this.draft()?.schema)
  readonly settings = attrModel(this.draft, 'settings')
  readonly dimensions = computed(() => this.cube()?.dimensions)
  readonly dimensionUsages = computed(() => this.cube()?.dimensionUsages)
  readonly measures = computed(() => this.cube()?.measures)

  // Fact name (table or sql alias)
  readonly factName = computed(() => {
    const cube = this.cube()
    if (!cube) return null
    if (cube.fact?.type === 'table') {
      return cube.fact.table?.name
    } else if (cube.fact?.type === 'view') {
      return cube.fact.view?.alias
    } else {
      return cube?.tables?.[0]?.name
    }
  })

  // Graph
  readonly _nodes = computed(() => {
    return (
      this.settings()?.nodes.reduce((acc, node) => {
        acc[node.key] = {
          position: node.position,
          size: node.size
        }
        return acc
      }, {}) ?? {}
    )
  })

  readonly nodes = computed<TCubeNode[]>(() => {
    const schema = this.schema()
    const cube = this.cube()
    if (!cube) {
      return []
    }

    const nodes: TCubeNode[] = [
      {
        key: cube.__id__,
        type: 'cube',
        data: cube,
        ...this.getPosition(cube.__id__)
      }
    ]
    this.dimensionUsages()?.forEach((_) => {
      const dimension = schema?.dimensions?.find((d) => d.__id__ === _.source)
      if (dimension) {
        nodes.push({
          key: _.__id__,
          type: 'shared-dimension',
          data: _,
          ...this.getPosition(_.__id__)
        })
      }
    })

    this.dimensions()?.forEach((dimension) => {
      nodes.push({
        key: dimension.__id__,
        type: 'inline-dimension',
        data: dimension,
        ...this.getPosition(dimension.__id__)
      })
    })
    return nodes
  })

  readonly connections = computed(() => {
    const schema = this.schema()
    const cube = this.cube()
    if (!cube) {
      return []
    }
    const connections: TCubeConnection[] = []
    this.dimensionUsages()?.forEach((_) => {
      const dimension = schema?.dimensions?.find((d) => d.__id__ === _.source)
      if (dimension) {
        connections.push({
          key: `${cube.__id__}-${_.__id__}`,
          source: cube.__id__ + '/' + _.__id__,
          target: _.__id__,
          type: 'cube-dimension-usage'
        })
      }
    })
    this.dimensions()?.forEach((dimension) => {
      connections.push({
        key: `${cube.__id__}-${dimension.__id__}`,
        source: cube.__id__ + '/' + dimension.__id__,
        target: dimension.__id__,
        type: 'cube-dimension'
      })
    })

    return connections
  })

  readonly scale = computed(() => this.settings()?.canvas?.scale || 1)
  readonly position = computed(() => this.settings()?.canvas?.position || { x: 0, y: 0 })

  readonly canvasLoaded = signal(false)
  // constructor() {
  //   effect(() => {
  //     console.log(this.dimensions(), this.measures())
  //   })
  // }

  public onLoaded(): void {
    console.log('Canvas loaded')
    setTimeout(() => {
      this.fCanvasComponent().resetScaleAndCenter(false)
      setTimeout(() => {
        this.canvasLoaded.set(true)
      }, 300)
    }, 300)
  }

  getPosition(key: string) {
    return {
      position: this._nodes()[key]?.position || { x: 0, y: 0 },
      size: this._nodes()[key]?.size || { width: 200, height: 100 }
    }
  }

  moveNode({ key, point }: { key: string; point: { x: number; y: number } }) {
    this.settings.update((settings) => {
      const nodes = settings?.nodes || []
      const index = nodes.findIndex((n) => n.key === key)
      if (index > -1) {
        nodes[index].position = point
      } else {
        nodes.push({ key, position: point })
      }
      return { ...settings, nodes }
    })
  }

  public onSizeChange(event: IRect, node: TCubeNode) {
    this.settings.update((settings) => {
      const nodes = settings?.nodes || []
      const index = nodes.findIndex((n) => n.key === node.key)
      if (index > -1) {
        nodes[index].size = { width: event.width, height: event.height }
      } else {
        nodes.push({
          key: node.key,
          position: { x: event.x, y: event.y },
          size: { width: event.width, height: event.height }
        })
      }
      return { ...settings, nodes }
    })
  }

  onCanvasChange(event: FCanvasChangeEvent) {
    if (!this.canvasLoaded()) {
      return
    }
    // this.settings.update((settings) => {
    //   return {
    //     ...settings,
    //     canvas: {
    //       position: event.position,
    //       scale: event.scale
    //     }
    //   }
    // })
  }

}

export type TCubeNode<T = any> = {
  key: string
  type: 'shared-dimension' | 'inline-dimension' | 'cube'
  data: T
  position?: { x: number; y: number }
  size?: { width: number; height: number }
}

export type TCubeConnection = {
  key: string
  source: string
  target: string
  type: 'cube-dimension' | 'cube-dimension-usage' | 'cube-measure'
}
