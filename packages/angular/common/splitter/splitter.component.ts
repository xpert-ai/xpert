import { CdkDragMove, CdkDragStart } from '@angular/cdk/drag-drop'
import { Component, ContentChildren, ElementRef, EventEmitter, HostBinding, HostListener, Input, Output, QueryList } from '@angular/core'
import { SplitterPaneComponent } from './splitter-pane/splitter-pane.component'

export const SPLITTER_INTERACTION_KEYS = new Set('right down left up arrowright arrowdown arrowleft arrowup'.split(' '))

export enum DragDirection {
  VERTICAL = 'y',
  HORIZONTAL = 'x'
}

/**
 * An enumeration that defines the `SplitterComponent` panes orientation.
 */
export enum SplitterType {
  Horizontal,
  Vertical,
}

const entriesMap = new WeakMap()

const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entriesMap.has(entry.target)) {
      const comp = entriesMap.get(entry.target)
      comp._resizeCallback(entry)
    }
  }
})

@Component({
  selector: 'ngm-splitter',
  templateUrl: './splitter.component.html',
  styleUrls: ['./splitter.component.scss'],
  standalone: false,
  host: {
    class: 'ngm-splitter',
  }
})
export class SplitterComponent {
  private _type: SplitterType = SplitterType.Horizontal
  /**
   * Gets/Sets the splitter orientation.
   * @example
   * ```html
   * <ngm-splitter [type]="type">...</ngm-splitter>
   * ```
   */
  @Input()
  get type() {
    return this._type
  }
  set type(value) {
    this._type = value
    if (this.panes) {
      // if type is changed runtime, should reset sizes.
      this.panes.forEach((x) => (x.size = 'auto'))
    }
  }

  /**
   * Gets the list of splitter panes.
   * @example
   * ```typescript
   * const panes = this.splitter.panes;
   * ```
   */
  @ContentChildren(SplitterPaneComponent, { read: SplitterPaneComponent })
  public panes!: QueryList<SplitterPaneComponent>

  /**
   * @hidden @internal
   * Gets the `flex-direction` property of the current `SplitterComponent`.
   */
  @HostBinding('style.flex-direction')
  public get direction(): string {
    return this.type === SplitterType.Horizontal ? 'row' : 'column'
  }

  /**
   * @hidden @internal
   * Gets/Sets the `overflow` property of the current splitter.
   */
  @HostBinding('style.overflow')
  public overflow = 'hidden'

  /**
   * @hidden @internal
   * Sets/Gets the `display` property of the current splitter.
   */
  @HostBinding('style.display')
  public display = 'flex'

  /**
   * @hidden @internal
   * A field that holds the initial size of the main `SplitterPaneComponent` in each pair of panes divided by a splitter bar.
   */
  private initialPaneSize!: number

  /**
   * @hidden @internal
   * A field that holds the initial size of the sibling pane in each pair of panes divided by a gripper.
   * @memberof SplitterComponent
   */
  private initialSiblingSize!: number

  /**
   * @hidden @internal
   * The main pane in each pair of panes divided by a gripper.
   */
  private pane!: SplitterPaneComponent

  /**
   * The sibling pane in each pair of panes divided by a splitter bar.
   */
  private sibling!: SplitterPaneComponent

  // private resizeSensor: ResizeSensor
  clientWidth: number
  clientHeight: number
  constructor(private readonly element: ElementRef) {
  }

  ngOnInit(): void {
    // // only initialize resize watching if sensor is availablei
    // if (ResizeSensor) {
    //   this.resizeSensor = new ResizeSensor(this.element.nativeElement, () => this.onResized());
    // }

    const target = this.element.nativeElement
    entriesMap.set(target, this)
    ro.observe(target)
  }

  ngOnDestroy(): void {
    // if (this.resizeSensor) {
    //   this.resizeSensor.detach();
    // }
    const target = this.element.nativeElement
    ro.unobserve(target)
    entriesMap.delete(target)
  }

  _resizeCallback(entry) {
    this.clientWidth = this.element.nativeElement.clientWidth
    this.clientHeight = this.element.nativeElement.clientHeight

    this.onMoveStart(this.panes.toArray()[0])
    this.onMoving(0)
  }

  // private onResized(): void {
  //   this.clientWidth = this.element.nativeElement.clientWidth
  //   this.clientHeight = this.element.nativeElement.clientHeight

  //   this.onMoveStart(this.panes.toArray()[0])
  //   this.onMoving(0)
  // }

  /** @hidden @internal */
  public ngAfterContentInit(): void {
    this.panes.forEach((pane) => (pane.owner = this))
    this.assignFlexOrder()
    this.panes.changes.subscribe(() => {
      this.panes.forEach((pane) => (pane.owner = this))
      this.assignFlexOrder()
    })
  }

  /**
   * @hidden @internal
   * This method performs  initialization logic when the user starts dragging the splitter bar between each pair of panes.
   * @param pane - the main pane associated with the currently dragged bar.
   */
  public onMoveStart(pane: SplitterPaneComponent) {
    const panes = this.panes.toArray()
    this.pane = pane
    this.sibling = panes[panes.indexOf(this.pane) + 1]

    const paneRect = this.pane.element.getBoundingClientRect()
    this.initialPaneSize = this.type === SplitterType.Horizontal ? paneRect.width : paneRect.height
    if (this.pane.size === 'auto') {
      this.pane.size = this.type === SplitterType.Horizontal ? paneRect.width : paneRect.height
    }

    const siblingRect = this.sibling.element.getBoundingClientRect()
    this.initialSiblingSize = this.type === SplitterType.Horizontal ? siblingRect.width : siblingRect.height
    if (this.sibling.size === 'auto') {
      this.sibling.size = this.type === SplitterType.Horizontal ? siblingRect.width : siblingRect.height
    }
  }

  /**
   * @hidden @internal
   * This method performs calculations concerning the sizes of each pair of panes when the bar between them is dragged.
   * @param delta - The difference along the X (or Y) axis between the initial and the current point when dragging the bar.
   */
  public onMoving(delta: number) {
    const maxSize = this.type === SplitterType.Horizontal ? this.clientWidth : this.clientHeight
    const min = parseInt(this.pane.minSize, 10) || 0
    const max = parseInt(this.pane.maxSize, 10) || maxSize || this.initialPaneSize + this.initialSiblingSize
    const minSibling = parseInt(this.sibling.minSize, 10) || 0
    const maxSibling = parseInt(this.sibling.maxSize, 10) || maxSize || this.initialPaneSize + this.initialSiblingSize

    const paneSize = this.initialPaneSize + delta
    const siblingSize = maxSize - paneSize - 6 //Math.min(this.initialSiblingSize + delta, maxSize - paneSize - 6)
    if (paneSize < min || paneSize > max || siblingSize < minSibling || siblingSize > maxSibling) {
      return
    }

    this.pane.size = paneSize + 'px'
    this.sibling.size = siblingSize + 'px'
  }

  /**
   * @hidden @internal
   * This method assigns the order of each pane.
   */
  private assignFlexOrder() {
    let k = 0
    this.panes.forEach((pane: SplitterPaneComponent) => {
      pane.order = k
      k += 2
    })
  }

  /** @hidden @internal */
  public getPaneSiblingsByOrder(order: number, barIndex: number): Array<SplitterPaneComponent> {
    const panes = this.panes.toArray()
    const prevPane = panes[order - barIndex - 1]
    const nextPane = panes[order - barIndex]
    const siblings = [prevPane, nextPane]
    return siblings
  }
}

/**
 * @hidden @internal
 * Represents the draggable bar that visually separates panes and allows for changing their sizes.
 */
 @Component({
  selector: 'ngm-splitter-bar',
  standalone: false,
  template: `<div class="ngm-splitter-bar"
  [class.ngm-splitter-bar--vertical]='type === 0'
  [style.cursor]='cursor'
  cdkDrag
  [cdkDragLockAxis]="dragDir"
  (cdkDragStarted)='onDragStart($event)'
  (cdkDragMoved)="onDragMove($event)"
>
  <div class="ngm-splitter-bar__expander--start" (click)='onCollapsing(false)' [hidden]='prevButtonHidden'></div>
  <div class="ngm-splitter-bar__handle"></div>
  <div class="ngm-splitter-bar__expander--end" (click)='onCollapsing(true)' [hidden]='nextButtonHidden'></div>
</div>
`,
  styles: []
})
export class SplitterBarComponent {
  /**
   * Set css class to the host element.
   */
  @HostBinding('class.ngm-splitter-bar-host')
  public cssClass = 'ngm-splitter-bar-host'

  /**
   * Gets/Sets the orientation.
   */
  @Input()
  public type: SplitterType = SplitterType.Horizontal

  /**
   * Sets/gets the element order.
   */
  @HostBinding('style.order')
  @Input()
  public order!: number

  /**
   * @hidden
   * @internal
   */
  @HostBinding('attr.tabindex')
  public get tabindex() {
    return this.resizeDisallowed ? null : 0
  }

  /**
   * @hidden
   * @internal
   */
  @HostBinding('attr.aria-orientation')
  public get orientation() {
    return this.type === SplitterType.Horizontal ? 'horizontal' : 'vertical'
  }

  /**
   * @hidden
   * @internal
   */
  public get cursor() {
    if (this.resizeDisallowed) {
      return ''
    }
    return this.type === SplitterType.Horizontal ? 'col-resize' : 'row-resize'
  }

  /**
   * Sets/gets the `SplitPaneComponent` associated with the current `SplitBarComponent`.
   * @memberof SplitBarComponent
   */
  @Input()
  public pane!: SplitterPaneComponent

  /**
   * Sets/Gets the `SplitPaneComponent` sibling components associated with the current `SplitBarComponent`.
   */
  @Input()
  public siblings!: Array<SplitterPaneComponent>

  /**
   * An event that is emitted whenever we start dragging the current `SplitBarComponent`.
   */
  @Output()
  public moveStart = new EventEmitter<SplitterPaneComponent>()

  /**
   * An event that is emitted while we are dragging the current `SplitBarComponent`.
   */
  @Output()
  public moving = new EventEmitter<number>()

  /**
   * A temporary holder for the pointer coordinates.
   */
  private startPoint!: number

  /**
   * @hidden @internal
   */
  public get prevButtonHidden() {
    return this.siblings[0].collapsed && !this.siblings[1].collapsed
  }

  /**
   * @hidden @internal
   */
  @HostListener('keydown', ['$event'])
  keyEvent(event: KeyboardEvent) {
    const key = event.key.toLowerCase()
    const ctrl = event.ctrlKey
    event.stopPropagation()
    if (SPLITTER_INTERACTION_KEYS.has(key)) {
      event.preventDefault()
    }
    switch (key) {
      case 'arrowup':
      case 'up':
        if (this.type === SplitterType.Vertical) {
          if (ctrl) {
            this.onCollapsing(false)
            break
          }
          if (!this.resizeDisallowed) {
            event.preventDefault()
            this.moveStart.emit(this.pane)
            this.moving.emit(10)
          }
        }
        break
      case 'arrowdown':
      case 'down':
        if (this.type === SplitterType.Vertical) {
          if (ctrl) {
            this.onCollapsing(true)
            break
          }
          if (!this.resizeDisallowed) {
            event.preventDefault()
            this.moveStart.emit(this.pane)
            this.moving.emit(-10)
          }
        }
        break
      case 'arrowleft':
      case 'left':
        if (this.type === SplitterType.Horizontal) {
          if (ctrl) {
            this.onCollapsing(false)
            break
          }
          if (!this.resizeDisallowed) {
            event.preventDefault()
            this.moveStart.emit(this.pane)
            this.moving.emit(10)
          }
        }
        break
      case 'arrowright':
      case 'right':
        if (this.type === SplitterType.Horizontal) {
          if (ctrl) {
            this.onCollapsing(true)
            break
          }
          if (!this.resizeDisallowed) {
            event.preventDefault()
            this.moveStart.emit(this.pane)
            this.moving.emit(-10)
          }
        }
        break
      default:
        break
    }
  }

  /**
   * @hidden @internal
   */
  public get dragDir() {
    return this.type === SplitterType.Horizontal ? DragDirection.HORIZONTAL : DragDirection.VERTICAL
  }

  /**
   * @hidden @internal
   */
  public get nextButtonHidden() {
    return this.siblings[1].collapsed && !this.siblings[0].collapsed
  }

  /**
   * @hidden @internal
   */
  public onDragStart(event: CdkDragStart) {
    if (this.resizeDisallowed) {
      // event.cancel = true
      return
    }
    // this.startPoint = this.type === SplitterType.Horizontal ? event.startX : event.startY
    this.moveStart.emit(this.pane)
  }

  /**
   * @hidden @internal
   */
  public onDragMove(event: CdkDragMove) {
    const isHorizontal = this.type === SplitterType.Horizontal
    // const curr = isHorizontal ? event.event.pageX : event.event.pageY
    const delta = isHorizontal ? event.distance.x : event.distance.y
    if (delta !== 0) {
      this.moving.emit(delta)
      // event.cancel = true
      event.source.element.nativeElement.style.transform = ''
    }
  }

  protected get resizeDisallowed() {
    const relatedTabs = this.siblings
    return !!relatedTabs.find((x) => x.resizable === false || x.collapsed === true)
  }

  /**
   * @hidden @internal
   */
  public onCollapsing(next: boolean) {
    const prevSibling = this.siblings[0]
    const nextSibling = this.siblings[1]
    let target
    if (next) {
      // if next is clicked when prev pane is hidden, show prev pane, else hide next pane.
      target = prevSibling.collapsed ? prevSibling : nextSibling
    } else {
      // if prev is clicked when next pane is hidden, show next pane, else hide prev pane.
      target = nextSibling.collapsed ? nextSibling : prevSibling
    }
    target.toggle()
  }
}
