import { coerceBooleanProperty } from '@angular/cdk/coercion'
import {
  AfterContentInit,
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  Directive,
  HostBinding,
  Input,
  QueryList,
  Renderer2,
  TemplateRef,
  ViewContainerRef
} from '@angular/core'

/**
 * @deprecated use tailwind
 */
@Directive({
  selector: '[igxActionStripMenuItem]'
})
export class IgxActionStripMenuItemDirective {
  constructor(public templateRef: TemplateRef<any>) {}
}

/**
 * @deprecated use tailwind
 */
@Component({
  selector: 'ngm-action-strip',
  templateUrl: 'action-strip.component.html'
})
export class IgxActionStripComponent implements AfterContentInit, AfterViewInit {
  /**
   * Sets the context of an action strip.
   * The context should be an instance of a @Component, that has element property.
   * This element will be the placeholder of the action strip.
   *
   * @example
   * ```html
   * <igx-action-strip [context]="cell"></igx-action-strip>
   * ```
   */
  @Input()
  public context: any
  /**
   * Menu Items ContentChildren inside the Action Strip
   *
   * @hidden
   * @internal
   */
  @ContentChildren(IgxActionStripMenuItemDirective)
  public _menuItems: QueryList<IgxActionStripMenuItemDirective>

  /**
   * ActionButton as ContentChildren inside the Action Strip
   *
   * @hidden
   * @internal
   */
  // @ContentChildren(IgxGridActionsBaseDirective)
  // public actionButtons: QueryList<IgxGridActionsBaseDirective>;

  /**
   * An @Input property that set the visibility of the Action Strip.
   * Could be used to set if the Action Strip will be initially hidden.
   *
   * @example
   * ```html
   *  <igx-action-strip [hidden]="false">
   * ```
   */
  @Input()
  public set hidden(value: boolean | string) {
    this._hidden = coerceBooleanProperty(value)
  }

  public get hidden(): boolean {
    return this._hidden
  }

  /**
   * Host `class.igx-action-strip` binding.
   *
   * @hidden
   * @internal
   */
  @Input('class')
  public hostClass: string

  /**
   * Reference to the menu
   *
   * @hidden
   * @internal
   */
  // @ViewChild('dropdown')
  // public menu: IgxDropDownComponent;

  /**
   * Getter for menu overlay settings
   *
   * @hidden
   * @internal
   */
  // public menuOverlaySettings: OverlaySettings = { scrollStrategy: new CloseScrollStrategy() };

  private _hidden = false

  constructor(
    private _viewContainer: ViewContainerRef,
    private renderer: Renderer2,
    // @Optional() @Inject(DisplayDensityToken) protected _displayDensityOptions: IDisplayDensityOptions,
    public cdr: ChangeDetectorRef
  ) {
    // super(_displayDensityOptions);
  }

  /**
   * Getter for the 'display' property of the current `IgxActionStrip`
   *
   * @hidden
   * @internal
   */
  @HostBinding('style.display')
  public get display(): string {
    return this._hidden ? 'none' : 'flex'
  }

  /**
   * Host `attr.class` binding.
   *
   * @hidden
   * @internal
   */
  @HostBinding('attr.class')
  public get hostClasses(): string {
    const classes = [this.getComponentDensityClass('ngm-action-strip')]
    // The custom classes should be at the end.
    if (!classes.includes('ngm-action-strip')) {
      classes.push('ngm-action-strip')
    }
    classes.push(this.hostClass)
    return classes.join(' ')
  }

  getComponentDensityClass(value) {
    return value
  }

  /**
   * Menu Items list.
   *
   * @hidden
   * @internal
   */
  public get menuItems() {
    const actions = []
    // this.actionButtons.forEach(button => {
    //     if (button.asMenuItems) {
    //         const children = button.buttons;
    //         if (children) {
    //             children.toArray().forEach(x => actions.push(x));
    //         }
    //     }
    // });
    return [...this._menuItems.toArray(), ...actions]
  }

  /**
   * @hidden
   * @internal
   */
  public ngAfterContentInit() {
    // this.actionButtons.forEach(button => {
    //     button.strip = this;
    // });
    // this.actionButtons.changes.subscribe(() => {
    //     this.actionButtons.forEach(button => {
    //         button.strip = this;
    //     });
    // });
  }

  /**
   * @hidden
   * @internal
   */
  public ngAfterViewInit() {
    // this.menu.selectionChanging.subscribe(($event) => {
    //     const newSelection = ($event.newSelection as any).elementRef.nativeElement;
    //     let allButtons = [];
    //     this.actionButtons.forEach(actionButtons => {
    //         if (actionButtons.asMenuItems) {
    //             allButtons = [...allButtons, ...actionButtons.buttons.toArray()];
    //         }
    //     });
    //     const button = allButtons.find(x => newSelection.contains(x.container.nativeElement));
    //     if (button) {
    //         button.actionClick.emit();
    //     }
    // });
  }

  /**
   * Showing the Action Strip and appending it the specified context element.
   *
   * @param context
   * @example
   * ```typescript
   * this.actionStrip.show(row);
   * ```
   */
  public show(context?: any): void {
    this.hidden = false
    if (!context) {
      return
    }
    // when shown for different context make sure the menu won't stay opened
    if (this.context !== context) {
      this.closeMenu()
    }
    this.context = context
    if (this.context && this.context.element) {
      this.renderer.appendChild(context.element.nativeElement, this._viewContainer.element.nativeElement)
    }
    this.cdr.detectChanges()
  }

  /**
   * Hiding the Action Strip and removing it from its current context element.
   *
   * @example
   * ```typescript
   * this.actionStrip.hide();
   * ```
   */
  public hide(): void {
    this.hidden = true
    this.closeMenu()
    if (this.context && this.context.element) {
      this.renderer.removeChild(this.context.element.nativeElement, this._viewContainer.element.nativeElement)
    }
  }

  /**
   * Close the menu if opened
   *
   * @hidden
   * @internal
   */
  private closeMenu(): void {
    // if (this.menu && !this.menu.collapsed) {
    //     this.menu.close();
    // }
  }
}
