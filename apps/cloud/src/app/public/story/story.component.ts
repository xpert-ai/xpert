import { Component, ElementRef, HostBinding, OnInit, Renderer2, computed, effect, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ActivatedRoute } from '@angular/router'
import { NxCoreService } from '@xpert-ai/core'
import { WasmAgentService } from '@xpert-ai/ocap-angular/wasm-agent'
import { NxStoryService, Story } from '@xpert-ai/story/core'
import { provideStory } from '@xpert-ai/story'
import { map } from 'rxjs/operators'
import { AgentType, registerWasmAgentModel } from '../../@core'
import { effectStoryTheme, registerStoryThemes } from '../../@theme'
import { AppService } from '../../app.service'

@Component({
  standalone: false,
  selector: 'pac-story-viewer',
  templateUrl: 'story.component.html',
  styleUrls: ['story.component.scss'],
  providers: [NxCoreService, provideStory()]
})
export class StoryViewerComponent implements OnInit {
  private renderer = inject(Renderer2)
  private _elementRef = inject(ElementRef)
  private coreService = inject(NxCoreService)
  public appService = inject(AppService)
  private storyService = inject(NxStoryService)
  private route = inject(ActivatedRoute)
  private readonly wasmAgent = inject(WasmAgentService)

  readonly story = signal<Story>(null)
  readonly models = computed(() => this.story()?.models)
  pageKey: string
  widgetKey: string

  readonly isDark$ = this.appService.isDark$
  readonly isAuthenticated$ = this.appService.isAuthenticated$

  readonly watermark$ = computed(() => {
    const user = this.story()?.createdBy
    if (user) {
      return `${user.mobile ?? ''} ${user.email ?? ''}`
    }
    return ''
  })

  private _echartsThemeSub = registerStoryThemes(this.storyService)
  private echartsThemeSub = registerStoryThemes(this.storyService)

  private backgroundSub = this.storyService.storyOptions$
    .pipe(
      map((options) => options?.preferences?.storyStyling?.backgroundColor),
      takeUntilDestroyed()
    )
    .subscribe((backgroundColor) => {
      if (backgroundColor) {
        this.renderer.setStyle(this._elementRef.nativeElement, 'background-color', backgroundColor)
      }
    })

  constructor() {
    effectStoryTheme(this._elementRef)

    effect(() => {
      const models = this.models()
      models?.forEach((model) => {
        if (model?.agentType === AgentType.Wasm) {
          registerWasmAgentModel(this.wasmAgent, model)
        }
      })
    })

    effect(() => {
      this.storyService.setAuthenticated(this.appService.isAuthenticated())
    })
  }

  ngOnInit() {
    this.story.set(this.route.snapshot.data['story'])
    this.pageKey = this.route.snapshot.queryParamMap.get('pageKey')
    this.widgetKey = this.route.snapshot.queryParamMap.get('widgetKey')
  }

  @HostBinding('class.pac-story-viewer')
  get _storyViewerComponent() {
    return true
  }
}
