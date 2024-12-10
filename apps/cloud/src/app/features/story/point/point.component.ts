import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostBinding,
  HostListener,
  computed,
  inject,
  model,
  viewChild
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { StoryPointsService, convertStoryResult } from '@metad/cloud/state'
import { NgmTransformScaleDirective, NxCoreService } from '@metad/core'
import { NgmDrawerTriggerComponent } from '@metad/ocap-angular/common'
import { DensityDirective, effectAction } from '@metad/ocap-angular/core'
import { WasmAgentService } from '@metad/ocap-angular/wasm-agent'
import { AgentType, omit } from '@metad/ocap-core'
import { NxStoryService } from '@metad/story/core'
import { NxStoryModule, NxStoryPointComponent, SinglePageStoryComponent } from '@metad/story/story'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { injectRouteData } from 'ngxtension/inject-route-data'
import { BehaviorSubject, EMPTY, Observable, interval } from 'rxjs'
import { map, switchMap, tap } from 'rxjs/operators'
import { IStoryPoint, registerWasmAgentModel } from '../../../@core'
import { effectStoryTheme, registerStoryThemes } from '../../../@theme'
import { AppService } from '../../../app.service'
import { StoryScales } from '../types'
import { provideStory } from '@metad/story'
import { MaterialModule } from '../../../@shared/material.module'
import { TranslationBaseComponent } from '../../../@shared/language'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-point',
  templateUrl: 'point.component.html',
  styleUrls: ['point.component.scss'],
  host: {
    class: 'pac-story-point'
  },
  providers: [provideStory(), NxCoreService],
  imports: [
    CommonModule,
    NxStoryModule,
    MaterialModule,
    CdkMenuModule,
    TranslateModule,
    ContentLoaderModule,
    NgmTransformScaleDirective,
    NgmDrawerTriggerComponent,
    DensityDirective,

    SinglePageStoryComponent
  ]
})
export class StoryPointComponent extends TranslationBaseComponent {
  StoryScales = StoryScales

  public appService = inject(AppService)
  public storyService = inject(NxStoryService)
  private pointsService = inject(StoryPointsService)
  private wasmAgent = inject(WasmAgentService)
  private route = inject(ActivatedRoute)

  readonly storyPointComponent = viewChild('storyPointComponent', { read: NxStoryPointComponent })
  readonly sps = viewChild('sps', { read: ElementRef })

  readonly storyPoint = injectRouteData<IStoryPoint>('storyPoint')

  @HostBinding('class.fullscreen')
  fullscreen = false
  timer: number
  /**
   * X minutes scheduler to refresh story data
   */
  Schedulers = [1, 5, 10, 15, 30, 60]

  // public readonly pointId$ = this.route.params.pipe(
  //   startWith(this.route.snapshot.params),
  //   map((params) => params?.id),
  //   filter((id) => !!id),
  //   distinctUntilChanged()
  // )

  // public readonly storyPoint$ = this.pointId$.pipe(
  //   switchMap((id) =>
  //     this.pointsService
  //       .getOne(id, [
  //         'widgets',
  //         'story',
  //         // 'story.model',
  //         // 'story.model.dataSource',
  //         // 'story.model.dataSource.type',
  //         // 'story.model.indicators',

  //         'story.models',
  //         'story.models.dataSource',
  //         'story.models.dataSource.type',
  //         'story.models.indicators',

  //         // 'story.points',
  //         'createdBy'
  //       ])
  //       .pipe(
  //         catchError((err) => {
  //           this.error$.next(err.error)
  //           return EMPTY
  //         })
  //       )
  //   ),
  //   takeUntilDestroyed(),
  //   shareReplay(1)
  // )

  public readonly pointKey = computed(() => this.storyPoint()?.key)

  public readonly story$ = toObservable(this.storyPoint).pipe(
    map((point) => {
      return convertStoryResult({
        ...point.story,
        points: [omit(point, 'story')]
      })
    }),
    tap((story) => {
      story.models?.forEach((model) => {
        if (model.agentType === AgentType.Wasm) {
          registerWasmAgentModel(this.wasmAgent, model)
        }
      })

      if (story.options?.fullscreen) {
        this.toggleFullscreen(true)
      }
    })
  )

  public error$ = new BehaviorSubject(null)

  readonly sideMenuOpened = model(false)
  readonly isPanMode = this.storyService.isPanMode
  readonly scale = computed(() => this.storyService.currentPageState()?.scale ?? 100)

  private _echartsThemeSub = registerStoryThemes(this.storyService)

  constructor() {
    super()

    effectStoryTheme(this.sps)
  }

  async toggleFullscreen(fullscreen?: boolean) {
    this.fullscreen = fullscreen ?? !this.fullscreen
    if (this.fullscreen) {
      // requestFullscreen(this.document)
      this.appService.requestFullscreen(2)
    } else {
      // exitFullscreen(this.document)
      this.appService.exitFullscreen(2)
    }
  }

  readonly timerUpdate = effectAction((timer$: Observable<number>) => {
    return timer$.pipe(
      tap((t) => (this.timer = t)),
      switchMap((t) => (t ? interval(t * 1000 * 60) : EMPTY)),
      tap(() => this.storyPointComponent().refresh())
    )
  })

  togglePanTool() {
    const isPanMode = this.isPanMode()
    this.storyService.patchState({ isPanMode: !isPanMode })
  }

  zoomIn() {
    this.storyService.zoomIn()
  }

  zoomOut() {
    this.storyService.zoomOut()
  }

  setScale(scale: number) {
    this.storyService.setZoom(scale)
  }

  resetScalePan() {}

  resetZoom() {
    this.storyService.resetZoom()
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKeydown(event: KeyboardEvent) {
    this.toggleFullscreen(false)
  }
}
