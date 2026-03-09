import { CdkDrag, CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import { Component, DestroyRef, ElementRef, HostListener, afterNextRender, computed, inject, signal, viewChild, viewChildren } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'

import { MatIconModule } from '@angular/material/icon'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmDisplayBehaviourComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { NgmEntityPropertyComponent } from '@metad/ocap-angular/entity'
import { AggregationRole, CalculationType, nonNullable } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import ELK from 'elkjs'
import { debounceTime } from 'rxjs'
import { SemanticModelService } from '../../model.service'
import { ModelDesignerType } from '../../types'
import { ModelEntityService } from '../entity.service'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    ZardButtonComponent,
    MatTooltipModule,
    ButtonGroupDirective,
    MatIconModule,
    DensityDirective,
    NgmEntityPropertyComponent,
    NgmDisplayBehaviourComponent
  ],
  selector: 'pac-model-er',
  templateUrl: './er.component.html',
  styleUrls: ['./er.component.scss'],
  host: {
    class: 'pac-model-er'
  }
})
export class ERComponent {
  ModelDesignerType = ModelDesignerType
  AggregationRole = AggregationRole

  readonly cubeService = inject(ModelEntityService)
  readonly modelService = inject(SemanticModelService)
  readonly destroyRef = inject(DestroyRef)

  readonly area = viewChild('area', { read: ElementRef })
  readonly dimensionElements = viewChildren('dimensionRef', { read: ElementRef })
  readonly dimensionDrags = viewChildren('dimensionRef', { read: CdkDrag })
  readonly container = viewChild('container', { read: CdkDrag })
  readonly parent = viewChild('container', { read: ElementRef })
  readonly cubeElement = viewChild('cubeRef', { read: ElementRef })

  readonly cube = this.cubeService.cube
  readonly dimensions = computed(() => this.cubeService.cubeDimensions()?.filter(nonNullable))
  readonly measures = this.cubeService.measures
  readonly calculatedMembers = computed(() => {
    const members = this.cubeService.calculatedMembers()
    return members?.map((member) => ({
      ...member,
      role: AggregationRole.measure,
      calculationType: CalculationType.Calculated
    }))
  })

  readonly edges = signal<Record<string, any>>({})

  readonly connections = computed(() => {
    const cube = this.cube()
    const connections = []
    for (const dimension of this.dimensions()) {
      connections.push({
        id: dimension.__id__,
        sources: [cube.__id__],
        targets: [dimension.__id__]
      })
    }
    return connections
  })

  readonly layout = signal<Record<string, any>>({})
  readonly areaPosition = signal({ x: 0, y: 0 })
  readonly areaScale = signal(1)

  readonly isFocused = signal(false)
  readonly expandStatus = signal<Record<string, boolean>>({})

  readonly selected = computed(() => {
    const typeAndId = this.cubeService.selectedProperty()
    const [type, key] = typeAndId?.split('#') ?? []
    return {
      type,
      key
    }
  })

  elk = new ELK()

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  readonly #eventSub = this.cubeService.event$.pipe(debounceTime(100), takeUntilDestroyed()).subscribe((event) => {
    console.log(`event:`, event)
    if (event.type === 'dimension-created') {
      this.arrange()
    }
  })

  constructor() {
    afterNextRender(() => {
      this.autoLayout()
    })
  }

  arrange() {
    if (!this.cube().__id__) return

    const dimensions = this.dimensionElements()
    const graph = {
      id: 'root',
      layoutOptions: { 'elk.algorithm': 'radial' },
      children: [
        ...dimensions.map((dimension) => {
          return {
            // Set [data-key] attribute to the dimension element
            id: dimension.nativeElement.getAttribute('data-key'),
            width: dimension.nativeElement.offsetWidth,
            height: dimension.nativeElement.offsetHeight
          }
        }),
        // Cube
        {
          id: this.cube().__id__,
          width: this.cubeElement().nativeElement.offsetWidth,
          height: this.cubeElement().nativeElement.offsetHeight
        }
      ],
      edges: this.connections()
    }

    this.elk
      .layout(graph)
      .then((graph) => {
        // console.log(`graph result:`, graph)
        this.area().nativeElement.style.width = graph.width + 'px'
        this.area().nativeElement.style.height = graph.height + 'px'

        // 遍历节点，设置节点的位置和大小
        this.layout.set(
          graph.children.reduce((acc, node) => {
            acc[node.id] = node
            return acc
          }, {})
        )
        this.edges.set(
          graph.edges.reduce((acc, edge) => {
            const section = edge.sections[0]
            acc[edge.id] = {
              ...section,
              path: calcPath(section)
            }
            return acc
          }, {})
        )

        this.dimensionDrags().forEach((dimension) => {
          dimension.reset()
        })
      })
      .catch(console.error)
  }

  onDragEnd(event: CdkDragEnd, key: string) {
    this.edges.update((state) => {
      const edge = state[key]
      if (edge) {
        edge.endPoint ??= { x: 0, y: 0 }
        edge.endPoint.x += event.distance.x
        edge.endPoint.y += event.distance.y
      }

      return {
        ...state,
        [key]: {
          ...edge,
          path: edge ? calcPath(edge) : ''
        }
      }
    })
  }

  autoLayout() {
    this.arrange()

    setTimeout(() => {
      var parentWidth = this.parent().nativeElement.clientWidth;
      var parentHeight = this.parent().nativeElement.clientHeight;

      var childWidth = this.area().nativeElement.clientWidth;
      var childHeight = this.area().nativeElement.clientHeight;

      var leftPosition = (parentWidth - childWidth) / 2;
      var topPosition = (parentHeight - childHeight) / 2;
      this.areaPosition.update((state) => ({
        x: leftPosition,
        y: topPosition
      }))
    }, 600)
  }

  onContainerDragEnd(event: CdkDragEnd) {
    this.areaPosition.update((state) => ({
      x: state.x + event.distance.x,
      y: state.y + event.distance.y
    }))
    this.container().reset()
  }

  zoomIn() {
    this.areaScale.update((state) => state + 0.1)
  }

  zoomOut() {
    this.areaScale.update((state) => {
      state = state - 0.1
      return state <= 0.1 ? 0.1 : state
    })
  }

  toggleHierarchy(key: string) {
    this.expandStatus.update((state) => ({
      ...state,
      [key]: !state[key]
    }))
  }

  select(event, type: string, key: string) {
    event.stopPropagation()
    this.cubeService.setSelectedProperty(type, key)
  }

  toDimensionUsage(key: string) {
    this.cubeService.navigateDimension(key)
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    if (!this.isFocused()) return

    event.preventDefault() // Prevent default scrolling behavior

    // Increase or decrease the scale based on the direction of the scroll
    if (event.deltaY > 0) {
      this.zoomOut()
    } else {
      this.zoomIn()
    }
  }

  @HostListener('focus')
  onFocus() {
    this.isFocused.set(true)
  }

  @HostListener('blur')
  onBlur() {
    this.isFocused.set(false)
  }
}

function calcPath(section) {
  return `M${section.startPoint.x},${section.startPoint.y} Q${section.endPoint.x},${section.endPoint.y} ${section.endPoint.x},${section.endPoint.y}`
}
