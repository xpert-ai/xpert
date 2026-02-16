import { Component, ElementRef, EventEmitter, HostBinding, Input, Output } from '@angular/core'

@Component({
  selector: 'ngm-splitter-pane',
  templateUrl: './splitter-pane.component.html',
  styleUrls: ['./splitter-pane.component.scss'],
  standalone: false
})
export class SplitterPaneComponent {

  private _size = 'auto'
  private _collapsed = false

  /** @hidden @internal */
  public owner

  /**
   * Gets/Sets the size of the current pane.
   *  * @example
   * ```html
   * <ngm-splitter>
   *  <ngm-splitter-pane [size]='size'>...</ngm-splitter-pane>
   * </ngm-splitter>
   * ```
   */
  @Input()
  get size() {
    return this._size
  }

  set size(value) {
    this._size = value
    this.el.nativeElement.style.flex = this.flex
    this.sizeChange.emit(this._size)
  }

  /**
   * Gets/Sets the minimum allowed size of the current pane.
   * @example
   * ```html
   * <ngm-splitter>
   *  <ngm-splitter-pane [minSize]='minSize'>...</ngm-splitter-pane>
   * </ngm-splitter>
   * ```
   */
  @Input()
  public minSize!: string

  /**
   * Gets/Set the maximum allowed size of the current pane.
   * @example
   * ```html
   * <ngm-splitter>
   *  <ngm-splitter-pane [maxSize]='maxSize'>...</ngm-splitter-pane>
   * </ngm-splitter>
   * ```
   */
  @Input()
  public maxSize!: string

  /**
   * Gets/Sets whether pane is resizable.
   * @example
   * ```html
   * <ngm-splitter>
   *  <ngm-splitter-pane [resizable]='false'>...</ngm-splitter-pane>
   * </ngm-splitter>
   * ```
   * @remarks
   * If pane is not resizable its related splitter bar cannot be dragged.
   */
  @Input()
  public resizable = true

  /**
   * Event fired when collapsed state of pane is changed.
   * @example
   * ```html
   * <ngm-splitter>
   *  <ngm-splitter-pane (onToggle)='onPaneToggle($event)'>...</ngm-splitter-pane>
   * </ngm-splitter>
   * ```
   */
  @Output()
  public onToggle = new EventEmitter<SplitterPaneComponent>()

  /**
   * An event that is emitted while we are dragging the `SplitBarComponent`
   */
  @Output()
  public sizeChange = new EventEmitter<string|number>()

  /** @hidden @internal */
  @HostBinding('style.order')
  public order!: number

  /**
   *
   * @hidden @internal
   * Gets the host native element.
   */
  public get element(): any {
    return this.el.nativeElement
  }

  /**
   * @hidden @internal
   * Gets/Sets the `overflow`.
   */
  // @HostBinding('style.overflow')
  // public overflow = 'auto'

  /**
   * @hidden @internal
   * Gets/Sets the `minHeight` and `minWidth` properties of the current pane.
   */
  @HostBinding('style.min-height')
  @HostBinding('style.min-width')
  public minHeight = 0

  /**
   * @hidden @internal
   * Gets/Sets the `maxHeight` and `maxWidth` properties of the current `SplitterPaneComponent`.
   */
  @HostBinding('style.max-height')
  @HostBinding('style.max-width')
  public maxHeight = '100%'

  /**
   * @hidden @internal
   * Gets the `flex` property of the current `SplitterPaneComponent`.
   */
  @HostBinding('style.flex')
  public get flex() {
    const grow = this.size !== 'auto' ? 0 : 1
    const shrink = this.size !== 'auto' ? 0 : 1

    return `${grow} ${shrink} ${this.size}`
  }

  /**
   * @hidden @internal
   * Gets/Sets the 'display' property of the current pane.
   */
  @HostBinding('style.display')
  public display = 'flex'

  /**
   * Gets/Sets whether current pane is collapsed.
   * @example
   * ```typescript
   * const isCollapsed = pane.collapsed;
   * ```
   */
  @Input()
  public set collapsed(value) {
    this._collapsed = value
    this.display = this._collapsed ? 'none' : 'flex'
  }

  public get collapsed() {
    return this._collapsed
  }

  /** @hidden @internal */
  private _getSiblings() {
    const panes = this.owner.panes.toArray()
    const index = panes.indexOf(this)
    const siblings = []
    if (index !== 0) {
      siblings.push(panes[index - 1])
    }
    if (index !== panes.length - 1) {
      siblings.push(panes[index + 1])
    }
    return siblings
  }

  /**
   * Toggles the collapsed state of the pane.
   * @example
   * ```typescript
   * pane.toggle();
   * ```
   */
  public toggle() {
    // reset sibling sizes when pane collapse state changes.
    this._getSiblings().forEach((sibling) => (sibling.size = 'auto'))
    this.collapsed = !this.collapsed
    this.onToggle.emit(this)
  }

  constructor(private el: ElementRef) {}
}
