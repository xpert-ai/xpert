import { CdkDrag } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { DOCUMENT } from '@angular/common'
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  Inject,
  Input,
  Optional,
  Output,
  Renderer2,
  ViewContainerRef,
  booleanAttribute,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChildren
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { HammerModule } from '@angular/platform-browser'
import { ActivatedRoute, Params, Router } from '@angular/router'
import { TrialWatermarkComponent } from '@metad/components/trial-watermark'
import { NgmTransformScaleDirective, NxCoreModule, camelCaseObject } from '@metad/core'
import { NgmCommonModule, NgmConfirmDeleteComponent, NgmConfirmUniqueComponent } from '@metad/ocap-angular/common'
import { NgmSmartFilterBarService, OcapCoreModule, isNotEmpty } from '@metad/ocap-angular/core'
import { isNil, omitBlank } from '@metad/ocap-core'
import {
  MoveDirection,
  NxStoryService,
  PageHeaderLabelEnum,
  Story,
  StoryOptions,
  StoryPoint,
  WidgetComponentType,
  componentStyling
} from '@metad/story/core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { ISmartFilterBarOptions } from '@metad/story/widgets/filter-bar'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { isEqual, startsWith } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { BehaviorSubject, firstValueFrom, interval, merge } from 'rxjs'
import {
  combineLatestWith,
  debounce,
  delay,
  distinctUntilChanged,
  filter,
  map,
  tap,
  withLatestFrom
} from 'rxjs/operators'
import { NxStorySharedModule } from '../shared.module'
import { StorySharesComponent } from '../shares/shares.component'
import { NxStoryPointComponent } from '../story-point/story-point.component'

/**
 * 暂时将 providers 放在此 Story 组件上, 后续考虑更好的位置
 */
@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-story',
  templateUrl: './story.component.html',
  styleUrls: ['./story.component.scss'],
  host: {
    class: 'ngm-story'
  },
  providers: [NgmSmartFilterBarService],
  imports: [
    NxStorySharedModule,
    CdkMenuModule,
    HammerModule,
    TranslateModule,
    TrialWatermarkComponent,
    NxCoreModule,

    // OCAP Modules
    OcapCoreModule,
    NgmCommonModule,

    // Local modules
    NgmTransformScaleDirective,
    NxStoryPointComponent
  ]
})
export class NxStoryComponent implements AfterViewInit {
  ComponentType = WidgetComponentType
  PageHeaderLabelEnum = PageHeaderLabelEnum

  readonly #logger = inject(NGXLogger)
  private _renderer = inject(Renderer2)
  private readonly _dialog = inject(MatDialog)
  private readonly _viewContainerRef = inject(ViewContainerRef)
  readonly focusPage = injectQueryParams('focusPage')

  /**
  |--------------------------------------------------------------------------
  | Inputs and Outputs
  |--------------------------------------------------------------------------
  */
  readonly story = input<Story>(null)
  private story$ = toObservable(this.story)

  readonly editable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  /**
   * 默认打开的 Page
   */
  readonly pageKey = input<string>()

  /**
   * 聚焦 Widget
   */
  @Input() widgetKey: string
  @Input() watermark: string
  @Input() get dark() {
    return this.dark$.value
  }
  set dark(value) {
    this.dark$.next(value)
  }
  private dark$ = new BehaviorSubject(null)

  /**
   * 自定义选项, 运行时覆盖 Story Options
   */
  @Input() get options(): StoryOptions {
    return this.options$.value
  }
  set options(value) {
    this.options$.next(value)
  }
  private options$ = new BehaviorSubject<StoryOptions>(null)

  // @Input() filterBarOpened = false

  @Output() selectedStoryPointChange = new EventEmitter()
  // @Output() filterBarOpenedChange = new EventEmitter()
  @Output() saved = new EventEmitter()
  @Output() dataExploration = new EventEmitter()

  readonly storyPointComponents = viewChildren('story_point', { read: NxStoryPointComponent })
  readonly cdkDrags = viewChildren('story_point', { read: CdkDrag })

  readonly queryParams = injectQueryParams()

  @HostBinding('class.ngm-story--fullscreen')
  _fullscreen: boolean

  private style: any
  private _nghost: string

  readonly isFocused = signal(false)

  readonly preferences = toSignal(this.storyService.preferences$)

  // State Query
  readonly currentStory$ = this.storyService.story$
  // readonly filterBar$ = this.storyService.filterBar$
  // readonly filterBar = toSignal(this.storyService.filterBar$)
  // readonly filterBarOptions$ = this.storyService.filterBar$.pipe(map((filterBar) => filterBar?.options))
  // readonly filterBarStyling$ = this.storyService.filterBar$.pipe(map((filterBar) => filterBar?.styling))

  readonly preferences$ = this.storyService.preferences$

  readonly tabBar$ = this.storyService.preferences$.pipe(map((preferences) => preferences?.story?.tabBar))
  readonly tabHidden = toSignal(this.tabBar$.pipe(map((tabBar) => tabBar === 'hidden' || tabBar === 'point')))

  readonly tabIsPoint = computed(() => this.preferences()?.story?.tabBar === 'point')

  readonly isMobile$ = this.storyService.isMobile$

  readonly displayPoints = this.storyService.displayPoints
  readonly showStoryFilterBar$ = this.storyService.storyOptions$.pipe(
    map((options) => options?.hideStoryFilterBar),
    map((value) => value === false)
  )

  public readonly pageHeaderShowLabel = computed(() => this.preferences()?.story?.pageHeaderShowLabel)
  public readonly pageHeaderPosition = computed(() => this.preferences()?.story?.pageHeaderPosition)
  public readonly pageHeaderAlignTabs = computed(() => this.preferences()?.story?.pageHeaderAlignTabs ?? 'start')
  public readonly pageHeaderStretchTabs = computed(() => this.preferences()?.story?.pageHeaderStretchTabs ?? false)
  public readonly pageHeaderFitInkBarToContent = computed(
    () => this.preferences()?.story?.pageHeaderFitInkBarToContent ?? false
  )

  public readonly storySizeStyles = toSignal(this.storyService.storySizeStyles$)

  readonly scaleStyles = computed(
    () => {
      const storyOptions = this.storyService.storyOptions()
      const scale = storyOptions?.scale
      return scale
        ? {
            transform: `scale(${scale / 100})`,
            'transform-origin': 'left top'
          }
        : {}
    },
    { equal: isEqual }
  )
  readonly preferencesStoryStyling = computed(() => componentStyling(this.storyService.preferences()?.storyStyling))
  readonly preferencesPageStyling = computed(
    () =>
      componentStyling(this.storyService.preferences()?.pageStyling) ?? this.storyService.preferences()?.page?.styles
  )

  readonly storyStyle = computed(() => {
    const storyStyling = this.preferencesStoryStyling()
    return {
      ...storyStyling
    }
  })

  readonly pageStyle = computed(() => {
    const preferencesPageStyling = this.preferencesPageStyling()
    const scaleStyles = this.scaleStyles()
    return {
      ...preferencesPageStyling,
      ...scaleStyles
    }
  })

  public readonly isPanMode$ = this.storyService.isPanMode$
  public readonly disablePanMode$ = this.isPanMode$.pipe(map((value) => !value))

  /**
  |--------------------------------------------------------------------------
  | Signals
  |--------------------------------------------------------------------------
  */
  readonly enableWatermark$ = toSignal(
    this.storyService.preferences$.pipe(map((preferences) => preferences?.story?.enableWatermark))
  )
  readonly watermarkOptions$ = toSignal(
    this.storyService.preferences$.pipe(
      map((preferences) => {
        const watermarkOptions = camelCaseObject(omitBlank(preferences?.story?.watermarkOptions))
        return {
          ...(watermarkOptions ?? {}),
          text: watermarkOptions?.text || this.watermark
        }
      })
    )
  )
  readonly currentPageIndex = this.storyService.currentPageIndex
  readonly currentPageKey = this.storyService.currentPageKey

  readonly currentPageComponent = computed(() =>
    this.storyPointComponents()?.find((item) => item.key() === this.currentPageKey())
  )

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _storySavedSubscriber = this.storyService
    .onSaved()
    .pipe(
      debounce(() => interval(1000)),
      takeUntilDestroyed()
    )
    .subscribe(() => this.saved.emit())
  // 这里的 resize 还有用吗 ?
  private _resizeSubscriber = merge(
    this.selectedStoryPointChange
    // this.storyFilterDrawerChange
    // this.storyDesignerDrawerChange
  )
    .pipe(withLatestFrom(this.storyService.currentPageKey$), takeUntilDestroyed())
    .subscribe(([event, currentId]) => {
      // console.warn(`resize selected story page layout`)
      // TODO 需要重构成更好的方式
      this.storyPointComponents()
        ?.find((item) => item.point.id === currentId)
        ?.resize()
    })
  private _intentSubscriber = this.storyService
    .onIntent()
    .pipe(
      filter((intent) => intent?.semanticObject === 'StoryPoint'),
      takeUntilDestroyed()
    )
    .subscribe((intent) => {
      // this.selectedStoryPointKey = intent.action
      // let filters = this.currentPoint.filters || []
      if (intent.parameters) {
        Object.keys(intent.parameters).forEach((key) => {
          // filters = putFilter(filters, new NxFilter({dimension: key}, intent.parameters[key]))
        })
      }
      // this.currentPoint.filters = filters
      this.storyService.setCurrentPageKey(intent.action)
    })
  private _storyFiltersSubscriber = this.storyService.filters$
    .pipe(filter(isNotEmpty), takeUntilDestroyed())
    .subscribe((filters) => {
      this.#logger?.debug(`Story全局固定过滤器:`, filters)
      // filters.forEach(item => this.filterBarService.put(item))
    })

  #pageKeyEffect = effect(
    () => {
      const currentIndex = this.storyService.currentPageIndex()
      const pageKey = this.storyService.currentPageKey()
      if ((currentIndex !== 0 && pageKey)) {
        const queryParams: Params = { pageKey }
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: queryParams,
          queryParamsHandling: 'merge' // remove to replace all query params by provided
        })
      }
    },
    { allowSignalWrites: true }
  )

  private _storySub = this.story$
    .pipe(
      filter(Boolean),
      distinctUntilChanged(),
      delay(100),
      tap((story) => {
        this.storyService.setStory(story)
        setTimeout(() => {
          if (!isNil(this.pageKey())) {
            this.storyService.setCurrentPageKey(this.pageKey())
          } else {
            this.storyService.setCurrentIndex(0)
          }
        })
      }),
      combineLatestWith(this.options$),
      takeUntilDestroyed()
    )
    .subscribe(([story, options]) => {
      this.storyService.updateStoryOptions({
        ...(options ?? {})
      })
    })

  private advancedStyleSub = this.storyService.advancedStyle$.pipe(takeUntilDestroyed()).subscribe({
    next: (result) => {
      result = result?.replace(new RegExp(':host', 'g'), `[${this._nghost}]`)
      if (!isNil(this.style)) {
        this._renderer.removeChild(this._elementRef.nativeElement, this.style)
      }
      this.style = this.document.createElement('style')
      this.style.type = 'text/css'
      this.style.appendChild(this.document.createTextNode(result))
      this._renderer.appendChild(this._elementRef.nativeElement, this.style)
    },
    error: (err) => {
      console.error(err)
    }
  })

  private backgroundSub = this.storyService.storyOptions$
    .pipe(
      map((options) => options?.preferences?.storyStyling?.backgroundColor),
      takeUntilDestroyed()
    )
    .subscribe((backgroundColor) => {
      if (backgroundColor) {
        this._renderer.setStyle(this._elementRef.nativeElement, 'background-color', backgroundColor)
      }
    })

  /**
  |--------------------------------------------------------------------------
  | Copilot
  |--------------------------------------------------------------------------
  */
  /**
   * @todo 工作量大
   */
  // #widgetCommand = injectStoryWidgetCommand(this.storyService)

  constructor(
    public storyService: NxStoryService,
    private readonly translateService: TranslateService,
    private router: Router,
    private route: ActivatedRoute,
    @Inject(DOCUMENT) private document: Document,
    private _elementRef: ElementRef,
    @Optional()
    public settingsService?: NxSettingsPanelService
  ) {
    effect(
      () => {
        this.storyService.setEditable(this.editable())
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      const token = this.queryParams()['token']
      if (token) {
        this.storyService.patchState({ token })
      }
    }, { allowSignalWrites: true })
  }

  // ngOnChanges({ filterBarOpened }: SimpleChanges): void {
  //   if (pageKey) {
  //     if (pageKey.currentValue) {
  //       this.storyService.setCurrentPageKey(pageKey.currentValue)
  //     } else {
  //       this.storyService.setCurrentIndex(0)
  //     }
  //   }

  //   if (filterBarOpened) {
  //     this.storyService.updateStoryFilterBar({
  //       opened: filterBarOpened.currentValue
  //     })
  //   }
  // }

  ngAfterViewInit(): void {
    const attrs = this._elementRef.nativeElement.attributes
    for (let i = attrs.length - 1; i >= 0; i--) {
      if (startsWith(attrs[i].name, '_nghost')) {
        this._nghost = attrs[i].name
        break
      }
    }
  }

  trackByName(index: number, el: any) {
    return el.name
  }

  trackByKey(index: number, el: StoryPoint) {
    return el.key
  }

  onSelectedTabChange(event) {
    this.selectedStoryPointChange.emit(event)
  }

  onSelectedIndex(event) {
    this.storyService.setCurrentIndex(event as number)
  }

  openDialog() {
    const dialogRef = this._dialog.open(NgmConfirmUniqueComponent)
    return dialogRef.afterClosed()
  }

  /**
   * 新创建 Story Widget
   */
  async createWidget(type: string) {
    const name = await firstValueFrom(this.openDialog())
    if (name) {
      this.storyService.createStoryWidget({
        component: type,
        name
      })
    }
  }

  async onDrawerOpenedChange(opened: boolean) {
    // this.filterBarOpenedChange.emit(opened)
  }

  // /**
  //  * Open designer for filter bar
  //  */
  // readonly openStoryFilterBar = effectAction((origin$: Observable<void>) => {
  //   return origin$.pipe(
  //     withLatestFrom(this.storyService.id$),
  //     switchMap(
  //       ([, id]) =>
  //         this.settingsService?.openTabsDesigner(id, [
  //           {
  //             componentType: ComponentSettingsType.StoryFilterBar,
  //             label: 'STORY_DESIGNER.BUILDER_TITLE',
  //             icon: 'handyman',
  //             model: this.filterBar$.pipe(map((filterBar) => filterBar ?? {}))
  //           },
  //           {
  //             componentType: ComponentSettingsType.StoryFilterBar + '/Style',
  //             label: 'STORY_DESIGNER.STYLING_TITLE',
  //             icon: 'format_paint',
  //             model: this.filterBarStyling$.pipe(map((filterBar) => filterBar ?? {}))
  //           }
  //         ]) ?? EMPTY
  //     ),
  //     tap((result: [StoryFilterBar, StoryFilterBar['styling']]) => {
  //       const [filterBar, styling] = result
  //       if (filterBar || styling) {
  //         const options = { ...(filterBar ?? {}) }
  //         if (styling) {
  //           options.styling = styling
  //         }
  //         this.storyService.updateStoryFilterBar(options)
  //       }
  //     })
  //   )
  // })

  async openShare(point: StoryPoint) {
    const story = await firstValueFrom(this.currentStory$)
    const isAuthenticated = await firstValueFrom(this.storyService.isAuthenticated$)
    await firstValueFrom(
      this._dialog
        .open(StorySharesComponent, {
          viewContainerRef: this._viewContainerRef,
          data: {
            access: story.access,
            visibility: story.visibility,
            isAuthenticated,
            id: story.id,
            point
          }
        })
        .afterClosed()
    )
  }

  onStoryFilterBarOptionsChange(options: ISmartFilterBarOptions) {
    this.storyService.updateStoryFilterBar({ options })
  }

  /**
   * 删除当前故事点
   */
  async removeStoryPoint(event: StoryPoint) {
    const information = await firstValueFrom(
      this.translateService.get('Story.Common.ConfirmDeleteInfo', {
        Default: 'It is not deleted from the server until it is actually saved'
      })
    )
    const confirm = await firstValueFrom(
      this._dialog
        .open(NgmConfirmDeleteComponent, {
          data: { value: event.name, information }
        })
        .afterClosed()
    )

    if (confirm) {
      this.storyService.deleteStoryPoint(event.key)
    }
  }

  duplicateStoryPoint(key: string) {
    this.storyService.duplicateStoryPoint(key)
  }

  toggleStoryPointHidden(key: string) {
    this.storyService.toggleStoryPointHidden(key)
  }

  move(point: StoryPoint, direction: MoveDirection) {
    this.storyService.move({ direction, key: point.key })
  }

  saveStoryPoint(key: string) {
    this.storyService.saveStoryPoint(key)
  }

  private swipeCoord: [number, number]
  private swipeTime: number
  swipe(e: TouchEvent, when: string) {
    const coord: [number, number] = [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
    const time = new Date().getTime()

    if (when === 'start') {
      this.swipeCoord = coord
      this.swipeTime = time
    } else if (when === 'end') {
      const direction = [coord[0] - this.swipeCoord[0], coord[1] - this.swipeCoord[1]]
      const duration = time - this.swipeTime

      if (
        duration < 500 && //
        Math.abs(direction[0]) > 30 && // Long enough
        Math.abs(direction[0]) > Math.abs(direction[1] * 3)
      ) {
        this.storyService.swipe(direction[0] < 0 ? 'right' : 'left')
      }
    }
  }

  refresh(force = false) {
    this.storyService.refresh(force)
  }

  async slidePrev(loop = false) {
    this.storyService.swipe('left', loop)
  }

  async slideNext(loop = false) {
    this.storyService.swipe('right', loop)
  }

  resetScalePanState() {
    // this.cdkDrag?.reset()
    this.cdkDrags()?.forEach((item) => item.reset())
    this.storyService.resetZoom()
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.isFocused()) {
      return
    }

    // Alt + ArrowLeft
    // Alt + ArrowRight
    if (event.altKey) {
      if (event.key === 'ArrowLeft') {
        this.slidePrev()
      } else if (event.key === 'ArrowRight') {
        this.slideNext()
      }

      switch (event.code) {
        case 'Minus':
        case 'NumpadSubtract':
          this.storyService.zoomOut()
          break
        case 'Equal':
        case 'NumpadAdd':
          this.storyService.zoomIn()
          break
        case 'Digit0':
        case 'Numpad0':
          this.storyService.resetZoom()
          break
        case 'Escape':
          this.resetScalePanState()
          break
      }
    }

    if (this.editable()) {
      if (event.metaKey || event.ctrlKey) {
        if (event.shiftKey) {
          if (event.key === 'z' || event.key === 'Z') {
            this.storyService.redo()
            event.preventDefault()
          }
        } else {
          if (event.key === 's' || event.key === 'S') {
            this.storyService.saveStory()
            event.preventDefault()
          } else if (event.key === 'z' || event.key === 'Z') {
            this.storyService.undo()
            event.preventDefault()
          }
        }
      }
    }
  }

  @HostListener('wheel', ['$event'])
  onWheel(event: WheelEvent) {
    if (!this.isFocused()) return

    // Increase or decrease the scale based on the direction of the scroll
    if (event.altKey) {
      event.preventDefault() // Prevent default scrolling behavior
      if (event.deltaY > 0) {
        this.storyService.zoomOut()
      } else {
        this.storyService.zoomIn()
      }
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
