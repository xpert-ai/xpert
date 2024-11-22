import { BooleanInput, coerceBooleanProperty } from '@angular/cdk/coercion'
import { CdkDragMove } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { OverlayModule } from '@angular/cdk/overlay'
import {
  AfterViewInit,
  booleanAttribute,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ComponentRef,
  DestroyRef,
  effect,
  ElementRef,
  EventEmitter,
  HostBinding,
  HostListener,
  inject,
  Inject,
  Injector,
  input,
  Input,
  OnInit,
  Optional,
  output,
  Output,
  Renderer2,
  signal,
  ViewChild,
  ViewContainerRef
} from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { MatSnackBar } from '@angular/material/snack-bar'
import { ActivatedRoute, Params, Router } from '@angular/router'
import {
  Intent,
  IStoryWidget,
  nonBlank,
  nonNullable,
  NxCoreModule,
  saveAsYaml,
  WidgetMenu,
  WidgetMenuType,
  WidgetService
} from '@metad/core'
import { NgmCommonModule, NgmConfirmDeleteComponent } from '@metad/ocap-angular/common'
import { effectAction } from '@metad/ocap-angular/core'
import {
  assignDeepOmitBlank,
  DataFieldWithIntentBasedNavigation,
  DataSettings,
  mergeOptions,
  omit,
  OrderDirection
} from '@metad/ocap-core'
import {
  componentStyling,
  LinkedInteractionApplyTo,
  NX_STORY_STORE,
  NxStoryService,
  NxStoryStore,
  STORY_WIDGET_COMPONENT,
  StoryComment,
  StoryPointType,
  StoryWidgetComponentProvider,
  uuid,
  WidgetComponentType
} from '@metad/story/core'
import { NxSettingsPanelService } from '@metad/story/designer'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { select } from '@ngneat/elf'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { cloneDeep, isEmpty, isEqual, pick } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, combineLatest, EMPTY, firstValueFrom, from, Observable, of } from 'rxjs'
import {
  catchError,
  combineLatestWith,
  debounceTime,
  distinctUntilChanged,
  filter,
  map,
  startWith,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs/operators'
import { ExplainComponent } from '../explain/explain.component'
import { LinkedAnalysisComponent } from '../linked-analysis/linked-analysis.component'
import { NxStorySharedModule } from '../shared.module'
import { StorySharesComponent } from '../shares/shares.component'
import { StoryCommentsComponent } from '../story-comments/story-comments.component'
import { NxStoryPointService } from '../story-point.service'
import { NxStoryPointComponent } from '../story-point/story-point.component'
import { NxStoryWidgetService } from './story-widget.service'
import { CommandDialogComponent } from '@metad/copilot-angular'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'ngm-story-widget',
  templateUrl: './story-widget.component.html',
  styleUrls: ['./story-widget.component.scss'],
  host: {
    class: 'ngm-story-widget'
  },
  providers: [WidgetService, NxStoryWidgetService],
  imports: [
    NxStorySharedModule,
    OverlayModule,
    CdkMenuModule,
    TranslateModule,
    ContentLoaderModule,
    NxCoreModule,
    NgmCommonModule,

    StoryCommentsComponent
  ]
})
export class NxStoryWidgetComponent implements OnInit, AfterViewInit {
  ComponentType = WidgetComponentType
  WIDGET_MENU_TYPE = WidgetMenuType
  STORY_POINT_TYPE = StoryPointType
  ORDER_DIRECTION = OrderDirection

  readonly #logger? = inject(NGXLogger, { optional: true })
  private readonly _renderer = inject(Renderer2)
  private readonly _elementRef = inject(ElementRef)
  private readonly pointComponent? = inject(NxStoryPointComponent, { optional: true })
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  readonly destroyRef = inject(DestroyRef)

  // @Input() key: string
  readonly key = input<string>()

  readonly widget$ = this.stateService.state$
  readonly widget = toSignal(this.stateService.state$)

  public readonly widgetKey$ = this.widget$.pipe(
    map((widget) => widget.key),
    distinctUntilChanged()
  )

  readonly selected = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly selected$ = toObservable(this.selected)

  @HostBinding('class.ngm-story-widget__active')
  get _selected() {
    return this.selected()
  }

  readonly editable = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })
  readonly editable$ = toObservable(this.editable)
  @HostBinding('class.ngm-story-widget__editable')
  get _editable() {
    return this.editable()
  }

  // @Input()
  @HostBinding('class.ngm-story-widget__fullscreen')
  get fullscreen(): boolean {
    return this.widget()?.fullscreen
  }
  set fullscreen(fullscreen) {
    this.fullscreenChange.emit(fullscreen)
  }

  @Input() laneKey: string
  @Input() get disableStyles(): boolean {
    return this._disableStyles
  }
  set disableStyles(value: BooleanInput) {
    this._disableStyles = coerceBooleanProperty(value)
  }
  private _disableStyles = false

  @Input() standalone = false

  @Output() optionsChange = new EventEmitter()
  @Output() fullscreenChange = new EventEmitter<boolean>()
  @Output() focusChange = new EventEmitter<boolean>()
  readonly selectedChange = output<boolean>()

  @ViewChild('anchor', { read: ViewContainerRef }) anchor: ViewContainerRef

  @HostBinding('class.ngm-story-widget__placeholder')
  disableFab = false
  isCommentOpen = false
  customSubMenus = []

  readonly comments = signal(null)

  private readonly widgets = toSignal(this.storyPointService.widgets$)

  readonly component$ = this.widget$.pipe(
    select((widget) => {
      if (this.editable() && widget?.isTemplate) {
        return null
      }
      return widget?.component
    })
  )

  public readonly placeholder$ = this.component$.pipe(
    map((component) => !component),
    distinctUntilChanged()
  )
  readonly dataSettings$ = this.widget$.pipe(
    select((widget) => widget.dataSettings),
    filter<DataSettings>(nonNullable),
    filter<DataSettings>((dataSettings) => nonBlank(dataSettings.entitySet))
  )

  readonly componentInstance$ = new BehaviorSubject<IStoryWidget<any>>(null)
  readonly pointList = this.storyService.points

  readonly componentProvider$ = this.component$.pipe(
    filter(Boolean),
    map((type) => this._widgetComponents.find((component) => component.type === type))
  )
  readonly componentProvider = toSignal(
    this.component$.pipe(
      filter(Boolean),
      map((type) => this._widgetComponents.find((component) => component.type === type))
    )
  )
  readonly componentCategory$ = this.componentProvider$.pipe(map((componentProvider) => componentProvider?.category))
  readonly componentClasses$ = this.componentCategory$.pipe(
    map((category) => ({
      ['ngm-story-widget__' + category]: true,
      'ngm-story-widget__card': ['card'].includes(category)
    }))
  )

  readonly showMenu$ = combineLatest([this.componentProvider$.pipe(startWith(null)), this.editable$]).pipe(
    map(([componentProvider, editable]) => editable || !componentProvider?.disableFab)
  )

  readonly navigate$ = this.dataSettings$.pipe(
    map((dataSettings) => ({
      show: !!(dataSettings.identificationAnnotation?.[0] as DataFieldWithIntentBasedNavigation)?.action,
      dataSettings
    }))
  )

  public readonly menus$ = combineLatest([this.widgetService.menus$, this.editable$]).pipe(
    map(([menus, editable]) => menus?.filter((item) => editable || !item.editable))
  )

  // css styling
  public readonly widgetStyle$: Observable<any> = combineLatest([
    this.storyService.preferences$,
    this.widget$.pipe(map((widget) => widget?.styling)),
    this.componentProvider$
  ]).pipe(
    filter(() => !this.disableStyles),
    combineLatestWith(this.widget$.pipe(select((widget) => widget?.fullscreen))),
    map(([[preferences, styling, componentProvider], fullscreen]) => {
      if (fullscreen) {
        return null
      }

      if (componentProvider.isCard) {
        return componentStyling(
          mergeOptions({}, preferences?.widget?.styling, preferences?.card?.styling, styling?.component)
        )
      }

      if (componentProvider.category) {
        return componentStyling(
          mergeOptions(
            {},
            preferences?.widget?.styling,
            preferences?.[componentProvider.category]?.styling,
            styling?.component
          )
        )
      }

      return componentStyling(mergeOptions({}, preferences?.widget?.styling, styling?.component))
    })
  )

  public readonly styling$ = combineLatest([
    this.storyService.displayDensity$,
    this.widget$.pipe(map((widget) => widget?.styling))
  ]).pipe(
    map(([displayDensity, styling]) => {
      return assignDeepOmitBlank(
        {
          appearance: { displayDensity }
        },
        styling,
        5
      )
    })
  )

  // public readonly linkedAnalysis$ = this.stateService.linkedAnalysis$
  readonly linkedAnalysis = this.stateService.linkedAnalysis

  public readonly comments$ = toObservable(this.comments)

  readonly isAuthenticated = this.storyService.isAuthenticated

  // Story point components
  public readonly allowMultiLayer$ = combineLatest([
    this.pointComponent?.multiLayer$.pipe(map((multiLayer) => multiLayer?.allowMultiLayer)) ?? of(false),
    this.editable$
  ]).pipe(map(([allowMultiLayer, editable]) => allowMultiLayer && editable))

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _linkedAnalysisSub = combineLatest([
    this.componentInstance$.pipe(filter(nonNullable)),
    this.widgetKey$.pipe(
      switchMap((key) => this.storyPointService.selectLinkedAnalysis(key)),
      distinctUntilChanged(isEqual)
    )
  ]).subscribe(([componentInstance, slicers]) => {
    componentInstance.slicers = slicers
  })
  private componentProviderSub = this.componentProvider$.subscribe((componentProvider) => {
    this.disableFab = componentProvider?.disableFab
  })
  private selectedSub = this.selected$.subscribe(async (selected) => {
    this.componentInstance$.value?.focus()
    if (!selected) {
      this.isCommentOpen = false
    }
  })
  private keySub = this.widgetKey$.subscribe((key) => {
    this._renderer.addClass(this._elementRef.nativeElement, 'ngm-story-widget-' + key)
  })

  private refreshSub = this.storyService.onRefresh().subscribe((force) => {
    this.refresh(force)
  })

  private menuSub = this.widgetService
    .onMenuClick()
    .pipe(filter(nonNullable), takeUntilDestroyed())
    .subscribe((menu: WidgetMenu) => {
      if (menu.key === 'open_designer') {
        this.openEditAttributes()
      }
    })

  constructor(
    private readonly storyService: NxStoryService,
    private readonly storyPointService: NxStoryPointService,
    private readonly stateService: NxStoryWidgetService,
    @Inject(NX_STORY_STORE)
    private readonly storyStore: NxStoryStore,
    public readonly widgetService: WidgetService,
    private readonly translateService: TranslateService,
    private readonly _cdr: ChangeDetectorRef,
    private readonly _dialog: MatDialog,
    private readonly _injector: Injector,
    private _viewContainerRef: ViewContainerRef,

    @Optional()
    public settingsService?: NxSettingsPanelService,
    @Optional()
    @Inject(STORY_WIDGET_COMPONENT)
    private readonly _widgetComponents?: Array<StoryWidgetComponentProvider>,
    @Optional() private readonly _snackBar?: MatSnackBar
  ) {
    effect(() => {
      if (this.key()) {
        this.stateService.init(this.key())
      }
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.componentInstance$.value) {
        this.componentInstance$.value.editable = this.editable()
        this.componentInstance$.next(this.componentInstance$.value)
      }
    }, { allowSignalWrites: true })
  }

  ngAfterViewInit() {
    // find widget component
    this.componentProvider$
      .pipe(
        filter(nonNullable),
        switchMap((componentProvider) => {
          return from(this.createComponent(componentProvider))
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((componentRef: ComponentRef<IStoryWidget<any>>) => {
        this.initComponent(componentRef)
        this.componentInstance$.next(componentRef.instance)
      })

    // 当组件实例初始化后, 监听属性列表值变化, 并赋值给组件实例
    this.componentInstance$
      .pipe(
        filter(nonNullable),
        withLatestFrom(this.componentProvider$),
        switchMap(([componentInstance, componentProvider]) => {
          const fields = componentProvider.mapping
            .filter((field) => field !== 'styling')
            .map(
              (field) =>
                this.widget$.pipe(
                  select((widget) => widget[field]),
                  map((value) => ({ name: field, value }))
                )
              // this.select(this.widget$, (widget) => widget[field]).pipe(map((value) => ({ name: field, value })))
            )
          fields.push(this.storyService.locale$.pipe(map((value) => ({ name: 'locale', value }))))
          fields.push(this.styling$.pipe(map((value) => ({ name: 'styling', value }))))
          return combineLatest(fields).pipe(
            debounceTime(100),
            tap((fields) => {
              fields.forEach(({ name, value }) => {
                componentInstance[name] = value
              })
              this._cdr.markForCheck()
              this._cdr.detectChanges()
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()

    combineLatest([this.componentInstance$, this.editable$])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(([componentInstance, editable]) => {
        if (componentInstance) {
          componentInstance.editable = editable
          this._cdr.markForCheck()
          this._cdr.detectChanges()
        }
      })
  }

  ngOnInit(): void {
    if (this.widget().options?.hasComments) {
      this.storyStore
        .getWidgetComments(this.widget())
        .pipe(
          map((comments) => (isEmpty(comments) ? null : comments)),
          takeUntilDestroyed(this.destroyRef)
        )
        .subscribe((comments) => {
          this.comments.set(comments)
        })
    }
  }

  async createComponent(
    widgetComponentProvider: StoryWidgetComponentProvider
  ): Promise<ComponentRef<IStoryWidget<any>>> {
    this.anchor.clear()
    let component = widgetComponentProvider.component
    if (!component) {
      component = await widgetComponentProvider.factory()
    }
    return this.anchor.createComponent<IStoryWidget<unknown>>(component, {
      injector: this._injector
    })
  }

  initComponent(componentRef: ComponentRef<IStoryWidget<any>>) {
    componentRef.instance.key = this.widget().key
    /**
     * 反向更新数据源配置, 从组件本身到故事组件
     */
    componentRef.instance.dataSettingsChange
      ?.pipe(distinctUntilChanged(), withLatestFrom(this.widgetKey$), takeUntilDestroyed(this.destroyRef))
      .subscribe(([dataSettings, widgetKey]) => {
        this.storyPointService.updateWidget({
          key: widgetKey,
          dataSettings
        })
      })
    /**
     * 反向更新组件配置项, 从组件本身到故事组件
     */
    componentRef.instance.optionsChange
      ?.pipe(withLatestFrom(this.widget$), takeUntilDestroyed(this.destroyRef))
      .subscribe(([options, widget]) => {
        // 根据 id 更新 options, 忽略其他属性
        this.storyPointService.updateWidget({
          key: widget.key,
          options: cloneDeep(options)
        })
      })

    /**
     * 切片器与关联分析事件
     */
    componentRef.instance.linkSlicersChange?.subscribe((slicers) => {
      const linkedAnalysis = this.linkedAnalysis()
      switch (linkedAnalysis?.interactionApplyTo) {
        case LinkedInteractionApplyTo.OnlySelectedWidgets:
          this.storyPointService.sendLinkedAnalysis({
            originalWidget: this.widget().key,
            linkedWidgets: linkedAnalysis.linkedWidgets,
            slicers
          })
          break
        case LinkedInteractionApplyTo.OnlyThisWidget:
          break
        case LinkedInteractionApplyTo.AllWidgetsOnPage:
        default:
          // TODO: page 级别的全局过滤
          this.storyPointService.sendLinkedAnalysis({
            originalWidget: this.widget().key,
            slicers
          })
      }
    })
  }

  onMenuClick(action) {
    this.widgetService.clickMenu(action)
  }

  /**
   * 删除 Story Widget
   */
  async removeWidget() {
    const information = await firstValueFrom(
      this.translateService.get('Story.Common.ConfirmDeleteInfo', {
        Default: 'It is not deleted from the server until it is actually saved'
      })
    )
    const confirm = await firstValueFrom(
      this._dialog
        .open(NgmConfirmDeleteComponent, {
          data: { value: this.widget().name, information }
        })
        .afterClosed()
    )

    if (confirm) {
      if (this.laneKey) {
        this.storyPointService.removeFlexLayout(this.laneKey)
      } else {
        this.storyPointService.removeWidget(this.widget().key)
      }
    }
  }

  navigate(dataSettings: DataSettings) {
    if (dataSettings.identificationAnnotation?.[0]) {
      const dataField = dataSettings.identificationAnnotation[0] as DataFieldWithIntentBasedNavigation
      const intent: Intent = {
        semanticObject: dataField.semanticObject,
        action: dataField.action,
        parameters: {}
      }

      // intent.parameters.value = dataField.value
      dataField.mapping?.forEach((item) => {
        // TODO 支持取自实际数据的字段值
        intent.parameters[item.semanticObjectProperty] = JSON.parse(item.localProperty || 'null')
      })
      this.storyService.sendIntent(intent)
    }
  }

  focus() {
    this.focusChange.emit(true)
  }

  async pin() {
    await this.stateService.pin()
  }

  trackByMenu(index, menu) {
    return menu.key
  }

  onClickMenu(menu: WidgetMenu) {
    this.widgetService.clickMenu(menu)
  }

  onCommentchange(event) {
    this._snackBar.open(event.editor.getContent(), 'dismiss', { duration: 1000 })
  }

  onCreateComment({ text, dataRelated }) {
    if (text) {
      this.createComment({
        storyId: this.widget().storyId,
        pointId: this.widget().pointId,
        widgetId: this.widget().id,
        commentKey: uuid(),
        type: 'Widget',
        dimensions: null,
        text
      })
    }
  }

  readonly openDesigner = effectAction((origin$: Observable<void>) => {
    const model$ = combineLatest([this.widget$, this.componentProvider$]).pipe(
      map(([widget, componentProvider]) => pick(widget, ...componentProvider.mapping)),
      /**
       * @todo 应该有更好的办法?
       */
      distinctUntilChanged(isEqual)
    )

    return origin$.pipe(
      withLatestFrom(this.widget$),
      switchMap(([, widget]) => {
        return (
          this.settingsService
            ?.openTabsDesigner(widget.key, [
              {
                componentType: widget.component,
                label: 'STORY_DESIGNER.BUILDER_TITLE',
                icon: 'handyman',
                model: model$ // .pipe(tap((widget) => console.log(widget)))
              },
              {
                componentType: widget.component + '/Style',
                label: 'STORY_DESIGNER.STYLING_TITLE',
                icon: 'format_paint',
                model: this.widget$.pipe(map((widget) => widget?.styling ?? {}))
              }
            ])
            .pipe(
              /**
               * @todo 应该有更好的办法?
               */
              distinctUntilChanged(isEqual),
              tap(([builder, styling]) => {
                let updates
                if (builder) {
                  updates = { ...builder }
                }
                if (styling) {
                  updates = updates ?? {}
                  updates.styling = styling
                }
                if (updates) {
                  updates.key = widget.key
                  this.storyPointService.updateWidget(updates)
                }
              })
            ) ?? EMPTY
        )
      })
    )
  })

  async openLinkedAnalysis() {
    const widget = this.widget()
    const widgets = this.widgets()

    const linkedAnalysis = await firstValueFrom(
      this._dialog
        .open(LinkedAnalysisComponent, {
          data: {
            linkedAnalysis: cloneDeep(widget.linkedAnalysis) ?? {},
            widgets: widgets
              ?.filter((item) => item.key !== widget.key)
              .map((item) => ({ key: item.key, caption: item.name || item.title }))
          }
        })
        .afterClosed()
    )

    if (linkedAnalysis) {
      this.stateService.setLinkedAnalysis(linkedAnalysis)
    }
  }

  openEditAttributes() {
    if (this.editable()) {
      this.pointComponent?.selectWidget(this.widget(), this.disableFab)
      this.openDesigner()
      this.settingsService?.setEditable(true)
    }
  }

  readonly createComment = effectAction((comment$: Observable<StoryComment>) => {
    return comment$.pipe(
      switchMap((comment) =>
        this.storyStore.createComment(comment).pipe(
          tap({
            next: (comment) => this.addComment(comment),
            error: (e) => console.error(e)
          }),
          catchError(() => EMPTY)
        )
      )
    )
  })

  addComment(comment: StoryComment) {
    this.comments.update((comments) => [...(comments || []), comment])
  }

  onAddComment() {
    this.comments.update((comments) => comments || [])
    this.isCommentOpen = true
  }

  onCopy() {
    this.storyService.copyWidget(this.widget())
  }

  duplicate() {
    const newWidget = cloneDeep(omit(this.widget(), 'id', 'key'))

    this.storyPointService.createWidget({
      ...newWidget,
      position: {
        ...newWidget.position,
        x: newWidget.position.x + 1,
        y: newWidget.position.y + 1
      }
    })
  }

  async onCopyTo(pointKey: string) {
    this.storyService.copyWidgetTo({ pointKey, widgetKey: this.widget().key })
  }

  /**
   * Copy current widget to new page
   *
   * @param type story point page type
   */
  async onCopyToNew(type: StoryPointType) {
    try {
      await this.storyService.copyWidgetToNewPage(type, this.widget().key)
    } catch (err) {
      this._snackBar.open(`Error: ${(<Error>err).message}`, `Dismiss`, { duration: 2000 })
    }
  }

  async onMoveTo(pointKey: string) {
    this.storyService.moveWidgetTo({
      widget: { pointKey: this.storyPointService.storyPoint.key, key: this.widget().key },
      pointKey
    })
  }

  /**
   * Move current widget to new page
   *
   * @param type story point page type
   */
  async onMoveToNew(type: StoryPointType) {
    try {
      await this.storyService.moveWidgetToNewPage(this.storyPointService.storyPoint.key, this.widget().key, type)
    } catch (err) {
      this._snackBar.open(`Error: ${(<Error>err).message}`, `Dismiss`, { duration: 2000 })
    }
  }

  refresh(force = false) {
    // this.widgetService.clickMenu({
    //   key: 'refresh',
    //   icon: 'refresh',
    //   name: 'refresh',
    //   type: WidgetMenuType.Action
    // })
    this.widgetService.refresh(force)
  }

  async openSubscriptions() {
    // this._dialog
    //   .open(SubscriptionComponent, { data: { storyId: this.widget().storyId } })
    //   .afterClosed()
    //   .subscribe((result) => {
    //     //
    //   })
  }

  openAlerts() {
    //
  }

  async openShares() {
    const widget = this.widget()
    const story = await firstValueFrom(this.storyService.story$)
    const isAuthenticated = this.isAuthenticated()

    await firstValueFrom(
      this._dialog
        .open(StorySharesComponent, {
          viewContainerRef: this._viewContainerRef,
          data: {
            id: story.id,
            widget: widget,
            visibility: story.visibility,
            isAuthenticated,
            access: story.access
          }
        })
        .afterClosed()
    )
  }

  explain() {
    const explains = this.widgetService.explains()
    this._dialog
      .open(ExplainComponent, {
        panelClass: 'small',
        data: [...(explains ?? []), { slicers: this.componentInstance$.value.slicers }]
      })
      .afterClosed()
      .subscribe(() => {})
  }

  onDragFab(event: CdkDragMove) {
    const element = event.source.element.nativeElement
    const parent = element.parentElement
    const elementRect = element.getBoundingClientRect()
    const parentRect = parent.getBoundingClientRect()

    if (elementRect.top + elementRect.height > parentRect.bottom) {
      event.source.element.nativeElement.style.transform = `translate3d(0px, ${parentRect.height - elementRect.height}px, 0px)`
    } else if (elementRect.top < parentRect.top) {
      event.source.element.nativeElement.style.transform = `translate3d(0px, 0px, 0px)`
    }
  }

  async bringForward() {
    const multiLayer = await firstValueFrom(this.pointComponent?.multiLayer$)
    const maxLayerIndex = multiLayer.maxLayerIndex
    this.stateService.bringForward(maxLayerIndex)
  }
  async bringFront() {
    const multiLayer = await firstValueFrom(this.pointComponent?.multiLayer$)
    const maxLayerIndex = multiLayer.maxLayerIndex
    this.stateService.bringFront(maxLayerIndex)
  }
  async sendBackward() {
    const multiLayer = await firstValueFrom(this.pointComponent?.multiLayer$)
    const baseLayerIndex = multiLayer.baseLayerIndex
    this.stateService.sendBackward(baseLayerIndex)
  }
  async sendBack() {
    const multiLayer = await firstValueFrom(this.pointComponent?.multiLayer$)
    const baseLayerIndex = multiLayer.baseLayerIndex
    this.stateService.sendBack(baseLayerIndex)
  }

  onSubMenuOpened(event: WidgetMenu) {
    this.customSubMenus = event.menus
  }
  onSubMenuClosed(event: WidgetMenu) {
    //
  }

  download() {
    const fileName = (this.widget().name || this.widget().title || 'widget') + '.yml'
    saveAsYaml(fileName, omit(this.widget, 'id', 'key'))
  }

  async explore() {
    // const dataSettings = await firstValueFrom(this.dataSettings$)
    const fields = this.componentProvider().mapping.filter((field) => field !== 'styling')

    const queryParams: Params = {
      widgetKey: this.key(),
      explore: btoa(
        unescape(
          encodeURIComponent(
            JSON.stringify({
              ...pick(this.widget(), ...fields)
            })
          )
        )
      )
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: queryParams,
      queryParamsHandling: 'merge' // remove to replace all query params by provided
    })
  }

  generateWithAI() {
    this.selectedChange.emit(true)
    this._dialog
      .open(CommandDialogComponent, {
        backdropClass: 'bg-transparent',
        disableClose: true,
        data: {
          commands: ['widget']
        }
      })
      .afterClosed()
      .subscribe((result) => {})
  }

  @HostListener('click', ['$event'])
  onSelected(event) {
    // selected 时不一定就是在编辑当前组件
    if (!this.laneKey) {
      this.openDesigner()
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKeydown(event: KeyboardEvent) {
    if (this.fullscreen) {
      this.fullscreen = false
    }
  }
}
