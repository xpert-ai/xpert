import { computed, inject, Inject, Injectable, Optional } from '@angular/core'
import { ID } from '@xpert-ai/contracts'
import { createSubStore, dirtyCheckWith, WidgetService, write } from '@xpert-ai/core'
import { DataSettings } from '@xpert-ai/ocap-core'
import {
  LinkedAnalysisSettings,
  NX_STORY_FEED,
  NxStoryFeedService,
  StoryWidget
} from '@xpert-ai/story/core'
import { TranslateService } from '@ngx-translate/core'
import { ZardToastService } from '@xpert-ai/headless-ui'
import { firstValueFrom, Observable } from 'rxjs'
import { filter, tap } from 'rxjs/operators'
import { NxStoryPointService } from '../story-point.service'
import { select, withProps } from '@ngneat/elf'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { isEqual, negate } from 'lodash-es'
import { effectAction } from '@xpert-ai/ocap-angular/core'

@Injectable()
export class NxStoryWidgetService {
  readonly #storyPointService = inject(NxStoryPointService)
  private widgetService = inject(WidgetService)
  // readonly copilot? = inject(NgmCopilotService, { optional: true })

  /**
  |--------------------------------------------------------------------------
  | Store
  |--------------------------------------------------------------------------
  */
  readonly store = createSubStore(
    this.#storyPointService.store,
    { name: 'story_widget', arrayKey: 'key' },
    withProps<StoryWidget>(null)
  )
  readonly pristineStore = createSubStore(
    this.#storyPointService.pristineStore,
    { name: 'story_widget_pristine', arrayKey: 'key' },
    withProps<StoryWidget>(null)
  )
  readonly dirtyCheckResult = dirtyCheckWith(this.store, this.pristineStore, { comparator: negate(isEqual) })
  readonly dirty$ = toObservable(this.dirtyCheckResult.dirty)

  // get widget() {
  //   return this.get((state) => state)
  // }
  get widget() {
    return this.store.getValue()
  }
  readonly state$ = this.store.asObservable()

  /**
  |--------------------------------------------------------------------------
  | Observables
  |--------------------------------------------------------------------------
  */
  readonly messages = computed(() => [])
  readonly conversations = computed(() => [])

  readonly dataSettings$ = this.select((state) => state.dataSettings).pipe(
    filter<DataSettings>(Boolean),
    filter<DataSettings>((dataSettings) => !!dataSettings.entitySet)
  )

  readonly linkedAnalysis$ = this.select((state) => state.linkedAnalysis)
  readonly linkedAnalysis = toSignal(this.linkedAnalysis$)

  constructor(
    @Optional()
    @Inject(NX_STORY_FEED)
    private feedService?: NxStoryFeedService,
    @Optional() private translateService?: TranslateService,
    @Optional() private toast?: ZardToastService
  ) {
  }

  readonly init = effectAction((id$: Observable<ID>) => {
    return id$.pipe(
      tap((id: ID) => {
        this.store.connect(['widgets', id])
        this.pristineStore.connect(['widgets', id])

        // this.connect(this.#storyPointService, {
        //   parent: ['widgets', id as string],
        //   arrayKey: 'key'
        // })
      })
    )
  })

  select<R>(fn: (state: StoryWidget) => R) {
    return this.store.pipe(select(fn))
  }

  updater<ProvidedType = void, OriginType = ProvidedType>(
    fn: (state: StoryWidget, ...params: OriginType[]) => StoryWidget | void
  ) {
    return (...params: OriginType[]) => {
      this.store.update(write((state) => fn(state, ...params)))
    }
  }

  readonly setLinkedAnalysis = this.updater((state, linkedAnalysis: LinkedAnalysisSettings) => {
    state.linkedAnalysis = linkedAnalysis
  })

  readonly updateStyling = this.updater((state, styling: StoryWidget['styling']) => {
    state.styling = {
      ...(state.styling ?? {}),
      ...styling
    }
  })

  readonly bringForward = this.updater((state, maxLayerIndex: number) => {
    state.position.layerIndex = Math.min(maxLayerIndex, (state.position.layerIndex ?? 0) + 1)
  })
  readonly bringFront = this.updater((state, maxLayerIndex: number) => {
    state.position.layerIndex = maxLayerIndex
  })
  readonly sendBackward = this.updater((state, baseLayerIndex: number) => {
    state.position.layerIndex = Math.max(baseLayerIndex, (state.position.layerIndex ?? 0) - 1)
  })
  readonly sendBack = this.updater((state, baseLayerIndex: number) => {
    state.position.layerIndex = baseLayerIndex
  })

  async pin() {
    const widget = this.widget
    const storyPoint = this.#storyPointService.storyPoint
    if (!this.feedService) {
      throw new Error(`Not provide feed service`)
    }

    try {
      await firstValueFrom(
        this.feedService.createFeed({
          type: 'StoryWidget',
          entityId: widget.id,
          options: {
            storyId: widget.storyId,
            pageKey: storyPoint.key,
            widgetKey: widget.key
          }
        })
      )

      const pinSuccess = this.getTranslation('Story.Widget.PinSuccess', 'Widget pin success')
      this.toast?.success(pinSuccess, { description: widget.name, duration: 1000 })
    } catch (err) {
      const pinFailed = this.getTranslation('Story.Widget.PinFailed', 'Widget pin failed')
      this.toast?.error(pinFailed, { description: widget.name, duration: 1000 })
    }
  }

  getTranslation(code: string, text: string, params?) {
    let result = text
    this.translateService?.get(code, { Default: text, ...(params ?? {}) }).subscribe((value) => {
      result = value
    })

    return result
  }
}
