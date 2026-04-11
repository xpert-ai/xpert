import { CdkDrag, DragDropModule } from '@angular/cdk/drag-drop'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  Renderer2,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { NgmTransformScaleDirective } from '@xpert-ai/core'
import { NgmSmartFilterBarService } from '@xpert-ai/ocap-angular/core'
import { NxStoryService, Story } from '@xpert-ai/story/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { TranslateModule } from '@ngx-translate/core'
import { NxStoryPointService } from '../story-point.service'
import { NxStoryPointComponent } from '../story-point/story-point.component'
import { map } from 'rxjs/operators'
import { injectQueryParams } from 'ngxtension/inject-query-params'

@Component({
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'pac-single-page-story',
  templateUrl: 'sps.component.html',
  styleUrls: ['sps.component.scss'],
  host: {
    class: 'pac-single-page-story'
  },
  providers: [ NxStoryPointService, NgmSmartFilterBarService ],
  imports: [
    CommonModule,
    TranslateModule,
    DragDropModule,
    ContentLoaderModule,
    NgmTransformScaleDirective,
    NxStoryPointComponent
  ]
})
export class SinglePageStoryComponent {
  readonly storyService = inject(NxStoryService)
  readonly #renderer = inject(Renderer2)

  readonly story = input<Story>(null)
  readonly pointKey = input<string>(null)

  readonly storyContainer = viewChild('storyContainer', { read: ElementRef })
  readonly cdkDrag = viewChild('storyPoint', { read: CdkDrag })

  readonly queryParams = injectQueryParams()

  readonly isFocused = signal(false)

  readonly storySizeStyles = toSignal(this.storyService.storySizeStyles$)

  readonly isPanMode = this.storyService.isPanMode
  readonly disablePan = computed(() => !this.storyService.isPanMode())

  private backgroundSub = this.storyService.preferences$
  .pipe(
    map((preferences) => preferences?.storyStyling?.backgroundColor),
    takeUntilDestroyed()
  )
  .subscribe((backgroundColor) => {
    if (backgroundColor) {
      this.#renderer.setStyle(this.storyContainer().nativeElement, 'background-color', backgroundColor)
    }
  })

  constructor() {
    effect(() => {
      const story = this.story()
      if (story) {
        this.storyService.setStory(story, { fetched: true })
      }
    })

    effect(() => {
      const pointKey = this.pointKey()
      if (pointKey) {
        this.storyService.setCurrentPageKey(pointKey)
      }
    })

    effect(() => {
      const token = this.queryParams()['token']
      if (token) {
        this.storyService.patchState({ token })
      }
    })
  }

  resetScalePanState() {
    this.cdkDrag()?.reset()
    this.storyService.resetZoom()
  }

  @HostListener('focus')
  onFocus() {
    this.isFocused.set(true)
  }

  @HostListener('blur')
  onBlur() {
    this.isFocused.set(false)
  }

  @HostListener('document:keydown.alt', ['$event'])
  onAltKeydown(_event: Event) {
    this.storyService.patchState({ isPanMode: true })
  }

  @HostListener('document:keyup.alt', ['$event'])
  onAltKeyUp(_event: Event) {
    this.storyService.patchState({ isPanMode: false })
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    if (!this.isFocused()) {
      return
    }

    // Alt + ArrowLeft
    // Alt + ArrowRight
    if (event.altKey) {
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
  }
}
