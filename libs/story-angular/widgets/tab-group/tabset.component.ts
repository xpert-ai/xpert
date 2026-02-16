import { FocusMonitor, FocusOrigin } from '@angular/cdk/a11y'
import {
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  Output,
  Renderer2,
  ViewChild,
  computed,
  inject,
  output,
  signal
} from '@angular/core'
import { ThemePalette } from '@angular/material/core'
import { MatTabGroup, MatTabHeaderPosition } from '@angular/material/tabs'
import { NgmAppearance } from '@metad/ocap-angular/core'
import { DataSettings, IAdvancedFilter, ISlicer, nonNullable } from '@metad/ocap-core'
import { IStoryWidget } from '@metad/core'
import { WidgetComponentType } from '@metad/story/core'
import { WidgetComponentType as IndicatorCardWidgetType } from '@metad/story/widgets/indicator-card'

export interface NxWidgetTabsetOptions {
  slides?: Array<{
    key: string
    type: string
    title: string
    options: {
      title: string
      dataSettings: DataSettings
      options: any
      chartSettings?: any
      chartOptions?: any
      styling: {
        appearance: NgmAppearance
        widget: any
      }
    }

    disabled?: boolean
  }>

  disableRipple?: boolean
  preserveContent?: boolean
  animationDuration?: string
  alignTabs?: string
  stretchTabs?: boolean
  headerPosition?: MatTabHeaderPosition
  color?: ThemePalette
  disablePagination?: boolean
}

export interface WidgetStyling {
  appearance: NgmAppearance
  widget?: any
}

export interface WidgetSwiperState {
  title: string
  dataSettings: DataSettings
  options: NxWidgetTabsetOptions
}

@Component({
  standalone: false,
  selector: 'pac-story-widget-tabgroup',
  templateUrl: './tabset.component.html',
  styleUrls: ['./tabset.component.scss'],
  host: {
    class: 'pac-story-widget-tabgroup'
  }
})
export class NxWidgetTabGroupComponent implements IStoryWidget<NxWidgetTabsetOptions> {
  IndicatorCardWidgetType = IndicatorCardWidgetType
  WidgetComponentType = WidgetComponentType

  private _focusMonitor = inject(FocusMonitor)
  private elementRef = inject(ElementRef)
  private renderer = inject(Renderer2)

  @Input() get options(): NxWidgetTabsetOptions {
    return this._options$()
  }
  set options(value) {
    this._options$.set(value)
  }
  private _options$ = signal<NxWidgetTabsetOptions>(null)

  @Input() get styling() {
    return this.styling$()
  }
  set styling(value) {
    this.styling$.set(value)
  }
  private styling$ = signal<WidgetStyling>(null)

  @Input() get slicers(): ISlicer[] {
    return this._slicers()
  }
  set slicers(value) {
    this._slicers.set(value)
  }
  public readonly _slicers = signal<ISlicer[]>([])

  public readonly placeholder$ = computed(() => !this.options?.slides?.length)

  public slides$ = computed(() => {
    const slides = this.options?.slides
    return slides?.filter(nonNullable).map((slide) => ({
      ...slide,
      styling: {
        appearance: this.styling?.appearance
      }
    }))
  })

  @HostBinding('class.editable')
  @Input()
  editable: boolean

  @Input() locale?: string

  // @Output() slicersChange = new EventEmitter<Array<ISlicer | IAdvancedFilter>>()
  readonly slicersChange = output<ISlicer[]>()
  readonly linkSlicersChange = output<ISlicer[]>()

  @ViewChild(MatTabGroup) _tabGroup: MatTabGroup

  /** Focuses the widget. */
  focus(origin?: FocusOrigin, options?: FocusOptions): void {
    if (origin) {
      this._focusMonitor.focusVia(this._getHostElement(), origin, options)
    } else {
      this._getHostElement().focus(options)
    }
  }
  _getHostElement() {
    return this.elementRef.nativeElement
  }

  trackByKey(index: number, el?: any) {
    return el?.key
  }

  onResize(event) {
    this._tabGroup.realignInkBar()
  }

  onSlicersChange(event: ISlicer[]) {
    // this.slicersChange.emit(event)
    this.linkSlicersChange.emit(event)
  }
}
