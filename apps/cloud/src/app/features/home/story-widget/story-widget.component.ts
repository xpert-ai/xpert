import { Component, Input, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { WidgetsService, convertStoryResult, convertStoryWidgetResult } from '@xpert-ai/cloud/state'
import { WasmAgentService } from '@xpert-ai/ocap-angular/wasm-agent'
import { AgentType } from '@xpert-ai/ocap-core'
import { omit } from 'lodash-es'
import { BehaviorSubject, EMPTY } from 'rxjs'
import { catchError, filter, switchMap } from 'rxjs/operators'
import { registerWasmAgentModel } from '../../../@core'
import { CommonModule } from '@angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { EmbedWidgetComponent } from '@xpert-ai/story/story'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    EmbedWidgetComponent
  ],
  selector: 'pac-story-widget-feed',
  templateUrl: 'story-widget.component.html',
  styleUrls: ['story-widget.component.scss'],
  host: {
    class: 'pac-story-widget-feed'
  }
})
export class StoryWidgetFeedComponent {
  private readonly widgetsService = inject(WidgetsService)
  private readonly wasmAgent = inject(WasmAgentService)

  @Input() get id(): string {
    return this.id$.value
  }
  set id(value) {
    this.id$.next(value)
  }
  private id$ = new BehaviorSubject<string>(null)

  public readonly widget = toSignal(
    this.id$.pipe(
      filter((value) => !!value),
      switchMap((id) =>
        this.widgetsService
          .getOne(id, [
            'point',
            'point.story',
            'point.story.points',
            'createdBy',
            // 'point.story.model',
            // 'point.story.model.indicators',
            // 'point.story.model.dataSource',
            // 'point.story.model.dataSource.type'

            'point.story.models',
            'point.story.models.dataSource',
            'point.story.models.dataSource.type',
            'point.story.models.indicators'
          ])
          .pipe(
            catchError((err) => {
              this.error$.next(err.error)
              return EMPTY
            })
          )
      )
    )
  )

  public readonly story = computed(() => {
    const widget = this.widget()
    if (widget) {
      const story = convertStoryResult({
        ...widget.point.story,
        points: [
          {
            ...widget.point,
            story: null,
            widgets: [omit(widget, 'point')]
          }
        ]
      })

      story.models?.forEach((model) => {
        if (model.agentType === AgentType.Wasm) {
          registerWasmAgentModel(this.wasmAgent, model)
        }
      })

      return story
    }
  })

  public readonly _widget = computed(() => {
    const widget = this.widget()
    if (widget) {
      return convertStoryWidgetResult(widget)
    }
  })

  public error$ = new BehaviorSubject(null)
}
