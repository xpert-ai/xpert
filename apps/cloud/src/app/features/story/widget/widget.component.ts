import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, ElementRef, Renderer2, inject } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { WidgetsService, convertStoryResult, convertStoryWidgetResult } from '@xpert-ai/cloud/state'
import { NxCoreService } from '@xpert-ai/core'
import { NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { WasmAgentService } from '@xpert-ai/ocap-angular/wasm-agent'
import { AgentType, omit } from '@xpert-ai/ocap-core'
import { NxStoryService } from '@xpert-ai/story/core'
import { NxStoryModule, NxStoryPointService } from '@xpert-ai/story/story'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { catchError, distinctUntilChanged, filter, map, shareReplay, startWith, switchMap, tap } from 'rxjs/operators'
import { provideStory } from '@xpert-ai/story'
import { registerWasmAgentModel } from '../../../@core'
import { effectStoryTheme, registerStoryThemes } from '../../../@theme'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-story-widget',
  templateUrl: 'widget.component.html',
  styleUrls: ['widget.component.scss'],
  host: {
    class: 'pac-story-widget'
  },
  providers: [provideStory(), NxStoryPointService, NgmSmartFilterBarService, NxCoreService],
  imports: [CommonModule, NxStoryModule]
})
export class StoryWidgetComponent {
  public storyService = inject(NxStoryService)
  private pointService = inject(NxStoryPointService)
  private widgetsService = inject(WidgetsService)
  private wasmAgent = inject(WasmAgentService)
  private route = inject(ActivatedRoute)
  private _elementRef = inject(ElementRef)

  public readonly widgetId$ = this.route.params.pipe(
    startWith(this.route.snapshot.params),
    map((params) => params?.id),
    filter((id) => !!id),
    distinctUntilChanged()
  )

  public readonly widget$ = this.widgetId$.pipe(
    switchMap((id) =>
      this.widgetsService
        .getOne(id, [
          'point',
          'point.story',
          // 'point.story.model',
          // 'point.story.model.dataSource',
          // 'point.story.model.dataSource.type',
          // 'point.story.model.indicators',

          'point.story.models',
          'point.story.models.dataSource',
          'point.story.models.dataSource.type',
          'point.story.models.indicators',

          // 'point.story.points',
          'createdBy'
        ])
        .pipe(
          catchError((err) => {
            this.error$.next(err.error)
            return EMPTY
          })
        )
    ),
    takeUntilDestroyed(),
    shareReplay(1)
  )

  public readonly story$ = this.widget$.pipe(
    map((widget) => {
      return convertStoryResult({
        ...widget.point.story,
        points: [
          {
            ...widget.point,
            story: null,
            widgets: [omit(widget, 'point')]
          }
        ]
      })
    }),
    tap((story) => {
      story.models?.forEach((model) => {
        if (model.agentType === AgentType.Wasm) {
          registerWasmAgentModel(this.wasmAgent, model)
        }
      })
    })
  )

  public readonly _widget$ = this.widget$.pipe(map(convertStoryWidgetResult), shareReplay(1))

  public error$ = new BehaviorSubject(null)

  private _echartsThemeSub = registerStoryThemes(this.storyService)
  private _storySub = this.story$.pipe(takeUntilDestroyed()).subscribe((story) => {
    this.storyService.setStory(story)
  })
  private _widgetSub = this._widget$.pipe(takeUntilDestroyed()).subscribe((widget) => {
    this.pointService.init(widget.point.key)
    this.pointService.active(true)
  })

  constructor() {
    effectStoryTheme(this._elementRef)
  }
}
