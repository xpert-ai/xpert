import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule, DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  Inject,
  OnDestroy,
  OnInit,
  ViewContainerRef,
  computed,
  effect,
  inject,
  model,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router } from '@angular/router'
import { AbilityModule } from '@casl/angular'
import { FavoritesService, StoriesService } from '@metad/cloud/state'
import { NxCoreService } from '@metad/core'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { OcapCoreModule, effectAction } from '@metad/ocap-angular/core'
import { AgentType } from '@metad/ocap-core'
import { provideStory, StoryExplorerComponent } from '@metad/story'
import { NxStoryService, Story } from '@metad/story/core'
import { NxStoryComponent, NxStoryModule, StorySharesComponent } from '@metad/story/story'
import { TranslateModule } from '@ngx-translate/core'
import { EMPTY, Observable, firstValueFrom, interval } from 'rxjs'
import { map, startWith, switchMap, tap } from 'rxjs/operators'
import {
  AbilityActions,
  AccessEnum,
  BusinessType,
  IFavorite,
  MenuCatalog,
  Store,
  StoryStatusEnum,
  ToastrService,
  isMobile
} from '../../../@core'
import { effectStoryTheme, registerStoryThemes } from '../../../@theme'
import { AppService } from '../../../app.service'
import { StoryScales, downloadStory } from '../types'
import { MaterialModule } from '../../../@shared/material.module'
import { TranslationBaseComponent } from '../../../@shared/language'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    MaterialModule,
    DragDropModule,
    CdkMenuModule,
    AbilityModule,
    TranslateModule,
    OcapCoreModule,
    NxStoryModule,
    StoryExplorerComponent,

    NgmCommonModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-viewer',
  templateUrl: 'viewer.component.html',
  styleUrls: ['viewer.component.scss'],
  providers: [provideStory(), NxCoreService]
})
export class StoryViewerComponent extends TranslationBaseComponent implements OnInit, OnDestroy {
  AbilityActions = AbilityActions
  AccessEnum = AccessEnum
  StoryStatusEnum = StoryStatusEnum
  StoryScales = StoryScales

  private readonly _dialog: MatDialog = inject(MatDialog)
  private readonly _viewContainerRef = inject(ViewContainerRef)

  readonly storyComponent = viewChild('storyComponent', { read: NxStoryComponent })
  readonly storyContainer = viewChild('storyContainer', { read: ElementRef })

  @HostBinding('class.fullscreen')
  get fullscreen() {
    return this.storyOptions?.fullscreen
  }

  /**
   * X minutes scheduler to refresh story data
   */
  Schedulers = [1, 5, 10, 15, 30, 60]

  story: Story
  error: string

  elem: any
  dataTimer: number
  pageTimer: number

  // Is mobile
  readonly isMobile = this.appService.isMobile
  readonly sideMenuOpened = model(false)
  readonly globalFilterBarOpened = model(false)

  get storyOptions() {
    return this.story?.options
  }

  get showFullscreenButton() {
    return this.storyOptions?.showFullscreenButton ?? this.storyOptions?.fullscreen
  }
  get multiplePages() {
    return this.story?.points?.length > 1
  }

  readonly pageKey = toSignal(
    this.route.queryParams.pipe(
      startWith(this.route.snapshot.queryParams),
      map((queryParams) => queryParams['pageKey'])
    )
  )
  readonly widgetKey = toSignal(
    this.route.queryParams.pipe(
      startWith(this.route.snapshot.queryParams),
      map((queryParams) => queryParams['widgetKey'])
    )
  )
  readonly watermark$ = this.store.user$.pipe(map((user) => `${user.mobile ?? ''} ${user.email ?? ''}`))
  readonly isDark$ = this.appService.isDark$
  readonly isAuthenticated = this.storyService.isAuthenticated
  public readonly isPanMode$ = this.storyService.isPanMode$

  readonly scale = computed(() => this.storyService.currentPageState()?.scale ?? 100)

  // Story explorer
  readonly showExplorer = signal(false)
  readonly explore = signal(null)

  /**
  |--------------------------------------------------------------------------
  | Subscriptions (effect)
  |--------------------------------------------------------------------------
  */
  private _echartsThemeSub = registerStoryThemes(this.storyService)

  private queryParamsSub = this.route.queryParams.pipe(takeUntilDestroyed()).subscribe((params) => {
    this.showExplorer.set(!!params.explore)
    if (params.explore) {
      this.explore.set(JSON.parse(decodeURIComponent(window.escape(window.atob(params.explore)))))
    }
  })

  readonly #effectRef = effectStoryTheme(this.storyContainer)

  constructor(
    public appService: AppService,
    public storyService: NxStoryService,
    public storiesService: StoriesService,
    private store: Store,
    private favoritesService: FavoritesService,
    private toastr: ToastrService,
    private route: ActivatedRoute,
    private _router: Router,
    @Inject(DOCUMENT) private document: any,
  ) {
    super()

    effect(() => this.storyService.setAuthenticated(this.appService.isAuthenticated()), { allowSignalWrites: true })
  }

  ngOnInit() {
    this.elem = this.document.documentElement

    const story = this.route.snapshot.data['story']
    if (typeof story === 'string') {
      this.error = story
    } else if (story) {
      if (isMobile() && (<Story>story).models?.some((model) => model.agentType === AgentType.Wasm)) {
        this.toastr.warning(
          'PAC.MESSAGE.StoryRunWithWasmModelOnMobileWarn',
          { Default: 'Story with WASM models on mobile may have performance limitations. Use caution!' },
          '',
          {
            duration: Number.MAX_SAFE_INTEGER
          }
        )
      }
      this.story = story
      this.appService.setNavigation({ catalog: MenuCatalog.Stories, id: this.story.id, label: this.story.name })
      if (this.storyOptions?.fullscreen) {
        this.toggleFullscreen(true)
      }
    }
  }

  toggleGlobalFilterBar() {
    this.globalFilterBarOpened.update((state) => !state)
  }

  toggleFullscreen(fullscreen?: boolean) {
    this.story.options = this.story.options ?? {}
    this.story.options.fullscreen = fullscreen ?? !this.story.options.fullscreen
    if (this.story.options.fullscreen) {
      // requestFullscreen(this.document)
      this.appService.requestFullscreen(2)
    } else {
      // exitFullscreen(this.document)
      this.appService.exitFullscreen(2)
    }
  }

  async edit() {
    if (this.story.status === StoryStatusEnum.RELEASED) {
      const confirm = await firstValueFrom(
        this.toastr.confirm(
          {
            code: 'PAC.Story.ConfirmChangingReleasedStory',
            params: { Default: 'The story has been released, are you sure to edit it again?' }
          },
          {
            verticalPosition: 'top'
          }
        )
      )
      if (!confirm) {
        return
      }
    }

    const pageKey = this.route.snapshot.queryParams['pageKey']
    this._router.navigate(['story', this.story.id, 'edit'], {
      queryParams: {
        pageKey
      }
    })
  }

  readonly timerUpdate = effectAction((timer$: Observable<number>) => {
    return timer$.pipe(
      tap((t) => (this.dataTimer = t)),
      switchMap((t) => (t ? interval(t * 1000 * 60) : EMPTY)),
      tap(() => this.storyComponent().refresh(true))
    )
  })

  readonly timerPageDown = effectAction((timer$: Observable<number>) => {
    return timer$.pipe(
      tap((t) => (this.pageTimer = t)),
      switchMap((t) => (t ? interval(t * 1000 * 60) : EMPTY)),
      tap(() => this.storyComponent().slideNext(true))
    )
  })

  async toggleBookmark(bookmark: IFavorite) {
    if (bookmark) {
      await firstValueFrom(this.favoritesService.delete(bookmark.id))
      this.story.bookmark = null
    } else {
      const projectId = this.story.access === AccessEnum.Write ? this.story.projectId : null
      bookmark = await firstValueFrom(
        this.favoritesService.create({
          type: BusinessType.STORY,
          storyId: this.story.id,
          projectId
        })
      )
      this.story.bookmark = bookmark
    }
  }

  async onStoryDownload() {
    await downloadStory(this.storiesService, this.story.id)
  }

  async openShares(story: Story) {
    const isAuthenticated = this.isAuthenticated()

    await firstValueFrom(
      this._dialog
        .open(StorySharesComponent, {
          viewContainerRef: this._viewContainerRef,
          data: {
            id: story.id,
            visibility: story.visibility,
            isAuthenticated,
            access: story.access
          }
        })
        .afterClosed()
    )
  }

  async togglePanTool() {
    const isPanMode = await firstValueFrom(this.isPanMode$)
    this.storyService.patchState({ isPanMode: !isPanMode })
  }

  async zoomIn() {
    this.storyService.zoomIn()
  }

  async zoomOut() {
    this.storyService.zoomOut()
  }

  setScale(scale: number) {
    this.storyService.setZoom(scale)
  }

  resetScalePan() {
    this.storyComponent().resetScalePanState()
  }

  resetZoom() {
    this.storyService.resetZoom()
  }

  closeExplorer(event) {
    this.showExplorer.set(false)
    this._router.navigate([], {
      relativeTo: this.route,
      queryParams: { explore: null, widgetKey: null },
      queryParamsHandling: 'merge' // remove to replace all query params by provided
    })

    if (event) {
      this.storyService.updateWidget({
        pageKey: this.pageKey(),
        widgetKey: this.widgetKey(),
        widget: event
      })
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKeydown(event: KeyboardEvent) {
    this.toggleFullscreen(false)
  }

  @HostListener('document:keydown.alt', ['$event'])
  onSpaceKeydown(event: KeyboardEvent) {
    this.storyService.patchState({ isPanMode: true })
  }

  @HostListener('document:keyup.alt', ['$event'])
  onSpaceKeyUp(event: KeyboardEvent) {
    this.storyService.patchState({ isPanMode: false })
  }

  @HostBinding('class.pac-story-viewer')
  @HostBinding('class.ngm-story-container')
  get _storyViewerComponent() {
    return true
  }

  ngOnDestroy(): void {
    this.toggleFullscreen(false)
  }
}
