import { DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { CdkMenuModule } from '@angular/cdk/menu'
import { IRect } from '@foblex/2d/rect'
import {
  EFConnectionType,
  EFMarkerType,
  FCanvasChangeEvent,
  FCanvasComponent,
  FCreateConnectionEvent,
  FFlowComponent,
  FFlowModule,
  FZoomDirective
} from '@foblex/flow'
import { SemanticModelServerService, TSemanticModelDraft } from '@metad/cloud/state'
import { attrModel, linkedModel, NgmOcapCoreService } from '@metad/ocap-angular/core'
import { CalculationProperty, DeepPartial, isEntityType, ParameterProperty, Schema, Syntax } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { IPoint } from '@foblex/2d'
import { suuid } from '@cloud/app/@core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { Router } from '@angular/router'
import { derivedAsync } from 'ngxtension/derived-async'
import { CubeStudioCubeComponent } from './cube/cube.component'
import { CubeStudioInlineDimensionComponent } from './inline-dimension/inline-dimension.component'
import { CubeStudioContextMenuComponent } from './context-menu/menu.component'
import { CubeStudioSharedDimensionComponent } from './shared-dimension/shared-dimension.component'
import { TCubeConnection, TCubeNode } from './types'
import { layoutCubeGraph } from './layout'
import { ModelStudioService } from '../model.service'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { filter, switchMap } from 'rxjs/operators'
import { NgmCalculationEditorComponent } from '@metad/ocap-angular/entity'
import { Dialog } from '@angular/cdk/dialog'
import { NgmParameterCreateComponent } from '@metad/ocap-angular/parameter'

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
    MatTooltipModule,
    CubeStudioCubeComponent,
    CubeStudioSharedDimensionComponent,
    CubeStudioInlineDimensionComponent,
    CubeStudioContextMenuComponent
  ],
  host: {
    class: 'xp-cube-studio'
  },
  
})
export class CubeStudioComponent {
  eEFConnectionType = EFConnectionType
  eMarkerType = EFMarkerType

  readonly #studioService = inject(ModelStudioService)
  readonly modelAPI = inject(SemanticModelServerService)
  readonly #coreService = inject(NgmOcapCoreService)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #router = inject(Router)
  readonly #dialog = inject(Dialog)
  readonly #vcr = inject(ViewContainerRef)

  // Inputs
  readonly draft = model<TSemanticModelDraft<Schema>>()
  readonly cubeName = input('')

  // Children
  readonly fFlowComponent = viewChild(FFlowComponent)
  readonly fCanvasComponent = viewChild(FCanvasComponent)
  readonly fZoom = viewChild(FZoomDirective)

  // States
  readonly schema = attrModel(this.draft, 'schema')
  readonly cube = linkedModel({
    initialValue: null,
    compute: () => {
      return this.schema()?.cubes?.find((cube) => cube.name === this.cubeName())
    },
    update: (cube) => {
      if (cube) {
        this.schema.update((schema) => {
          const cubes = schema?.cubes ? [...schema.cubes] : []
          const existingCubeIndex = cubes?.findIndex((c) => c.name === cube.name)
          if (existingCubeIndex > -1) {
            cubes[existingCubeIndex] = cube
          } else {
            cubes.push(cube)
          }
          return { ...(schema ?? {}), cubes } as Schema
        })
      }
    }
  })
  
  readonly settings = attrModel(this.draft, 'settings')
  readonly settingsNodes = attrModel(this.settings, 'nodes')
  readonly dimensions = computed(() => this.cube()?.dimensions)
  readonly dimensionUsages = computed(() => this.cube()?.dimensionUsages)
  readonly measures = computed(() => this.cube()?.measures)
  readonly calculations = attrModel(this.cube, 'calculations')
  readonly parameters = attrModel(this.cube, 'parameters')

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
  readonly nodesPosition = computed(() => {
    return (
      this.settingsNodes()?.reduce((acc, node) => {
        acc[node.key] = {
          position: node.position,
          size: node.size
        }
        return acc
      }, {})
    )
  })

  readonly #nodes = computed<TCubeNode[]>(() => {
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
      const dimension = schema?.dimensions?.find((d) => d.name === _.source)
      dimension?.hierarchies?.forEach((h) => {
        nodes.push({
          key: h.__id__,
          type: 'shared-dimension',
          data: {dimension: dimension.__id__, hierarchy: h},
          ...this.getPosition(h.__id__)
        })
      })
    })

    this.dimensions()?.forEach((dimension) => {
      dimension.hierarchies?.forEach((hierarchy) => {
        nodes.push({
          key: hierarchy.__id__,
          type: 'inline-dimension',
          data: { dimension: dimension.__id__, hierarchy },
          ...this.getPosition(hierarchy.__id__)
        })
      })
    })
    
    return nodes
  })

  readonly #connections = computed(() => {
    const schema = this.schema()
    const cube = this.cube()
    if (!cube) {
      return []
    }
    const connections: TCubeConnection[] = []
    this.dimensionUsages()?.forEach((_) => {
      const dimension = schema?.dimensions?.find((d) => d.name === _.source)
      dimension?.hierarchies?.forEach((h) => {
        connections.push({
          key: `${cube.__id__}-${h.__id__}`,
          source: cube.__id__ + '/' + _.__id__,
          target: h.__id__,
          type: 'cube-dimension-usage'
        })
      })
    })
    this.dimensions()?.forEach((dimension) => {
      dimension.hierarchies?.forEach((hierarchy) => {
        connections.push({
          key: `${cube.__id__}-${hierarchy.__id__}`,
          source: cube.__id__ + '/' + dimension.__id__,
          target: hierarchy.__id__,
          type: 'cube-dimension'
        })
      })
    })

    return connections
  })

  readonly graph = derivedAsync(() => {
    const nodesPosition = this.nodesPosition()
    const nodes = this.#nodes()
    const connections = this.#connections()
    return nodesPosition ? Promise.resolve({nodes, connections}) : layoutCubeGraph(nodes, connections).then((nodes) => {
      return {nodes, connections}
    })
  })
  
  readonly scale = computed(() => this.settings()?.canvas?.scale || 1)
  readonly position = computed(() => this.settings()?.canvas?.position || { x: 0, y: 0 })

  readonly canvasLoaded = signal(false)

  // Data Settings
  readonly semanticModelKey = toSignal(this.#studioService.semanticModelKey$)
  readonly entityType = derivedAsync(() => {
    return this.cubeName()
      ? this.#studioService.dataSource$.pipe(
          filter((dataSource) => !!dataSource),
          switchMap((dataSource) => dataSource.selectEntityType(this.cubeName())),
          filter((entityType) => isEntityType(entityType))
        )
      : null
  })
  readonly dataSettings = computed(() => ({ dataSource: this.semanticModelKey(), entitySet: this.cubeName() }))

  private entityUpdateEventSub = this.#coreService
    ?.onEntityUpdate()
    .pipe(takeUntilDestroyed())
    .subscribe(({ type, dataSettings, parameter, property }) => {
      if (type === 'Parameter') {
        this.parameters.update((state) => {
          const parameters = state ? [...state] : []
          const index = parameters.findIndex((p) => p.__id__ === parameter.__id__)
          if (index > -1) {
            parameters[index] = {...parameter}
          } else {
            parameters.push({...parameter})
          }
          return parameters
        })
      } else {
        // @todo
      }
    })

  // constructor() {
  //   effect(() => {
  //     console.log(this.cube())
  //   })
  // }

  public onLoaded(): void {
    setTimeout(() => {
      this.fCanvasComponent().resetScaleAndCenter(false)
      setTimeout(() => {
        this.canvasLoaded.set(true)
      }, 300)
    }, 300)
  }

  getPosition(key: string) {
    return {
      position: this.nodesPosition()?.[key]?.position || { x: 0, y: 0 },
      size: this.nodesPosition()?.[key]?.size || { width: 200, height: 100 }
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

  public onConnectionDropped(event: FCreateConnectionEvent): void {
    if(!event.fInputId) {
      this.createNode(event.fOutputId, event.fDropPosition);
    } else {
      // this.createConnection(event.fOutputId, event.fInputId);
    }
    this.#cdr.detectChanges()
  }

  private createNode(outputId: string, position: IPoint): void {
    // console.log('createNode', outputId, position);
    const [cubeId, dimensionId] = outputId.split('/')
    const key = suuid()
    this.cube.update((cube) => {
      const dimension = cube.dimensions.find((d) => d.__id__ === dimensionId)
      if (dimension) {
        const hierarchies = dimension.hierarchies ? [...dimension.hierarchies] : []
        const hierarchy = {
          __id__: key,
          name: '',
          caption: `New Hierarchy ${hierarchies.length + 1}`,
          levels: [],
        }
        hierarchies.push(hierarchy)
        return { ...cube, dimensions: [...cube.dimensions.map((d) => d.__id__ === dimension.__id__ ? { ...d, hierarchies } : d)] }
      }
      return cube
    })

    this.settings.update((settings) => {
      const nodes = settings?.nodes ? [...settings.nodes] : []
      nodes.push({key, position: this.fFlowComponent().getPositionInFlow(position) })
      return { ...settings, nodes }
    })
  }

  autoLayout() {
    this.settingsNodes.set(null)
  }

  openModelInNewTab() {
    const url = this.#router.createUrlTree(['/models', this.#studioService.model().id, 'cube', this.cube().__id__]).toString()
    window.open(url, '_blank')
  }

  onEditCalculation(member?: Partial<CalculationProperty>) {
    this.#dialog.open<CalculationProperty>(
      NgmCalculationEditorComponent,
      {
        viewContainerRef: this.#vcr,
        backdropClass: 'xp-overlay-share-sheet',
        panelClass: 'xp-overlay-pane-share-sheet',
        data: {
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          syntax: Syntax.MDX,
          value: member
        }
      }).closed.subscribe({
        next: (value) => {
          if (value) {
            this.calculations.update((state) => {
              const calculations = [...(state ?? [])]
              const index = calculations.findIndex((item) => item.__id__ === value.__id__)
              if (index > -1) {
                calculations[index] = {...value}
              } else {
                calculations.push({...value})
              }
              return calculations
            })
          }
        }
      })
  }

  onEditParameter(member?: Partial<ParameterProperty>) {
    this.#dialog
      .open(NgmParameterCreateComponent, {
        viewContainerRef: this.#vcr,
        data: {
          dataSettings: this.dataSettings(),
          entityType: this.entityType(),
          name: member?.name
        }
      })
      .closed.subscribe((result: DeepPartial<ParameterProperty>) => {
        console.log(result)
      })
  }
}
