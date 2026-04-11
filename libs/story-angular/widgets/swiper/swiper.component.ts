import { CommonModule } from '@angular/common'
import { FocusMonitor, FocusOrigin } from '@angular/cdk/a11y'
import { Component, ElementRef, Renderer2, ViewEncapsulation, computed, inject } from '@angular/core'
import { cloneDeep } from '@xpert-ai/ocap-core'
import { AbstractStoryWidget, IsNilPipe, StoryWidgetState, StoryWidgetStyling } from '@xpert-ai/core'
import { ComponentStyling, WidgetComponentType, componentStyling } from '@xpert-ai/story/core'
import { PlaceholderAddComponent } from '@xpert-ai/story/story'
import { WidgetAnalyticalCardModule } from '@xpert-ai/story/widgets/analytical-card'
import { WidgetAnalyticalGridModule } from '@xpert-ai/story/widgets/analytical-grid'
import { AccountingIndicatorCardModule, WidgetComponentType as IndicatorCardWidgetType } from '@xpert-ai/story/widgets/indicator-card'
import { TranslateModule } from '@ngx-translate/core'
import { BehaviorSubject, map } from 'rxjs'
// import Swiper core and required components
import SwiperCore, {
  A11y,
  Autoplay,
  Controller,
  EffectCards,
  EffectCoverflow,
  EffectCreative,
  EffectCube,
  EffectFade,
  EffectFlip,
  Keyboard,
  Lazy,
  Mousewheel,
  Navigation,
  Pagination,
  Scrollbar,
  SwiperOptions,
  Thumbs,
  Virtual,
  Zoom
} from 'swiper'
import { PaginationOptions } from 'swiper/types'

// install Swiper components
SwiperCore.use([
  Navigation,
  Pagination,
  Scrollbar,
  A11y,
  Virtual,
  Zoom,
  Autoplay,
  Thumbs,
  Controller,
  Lazy,
  Mousewheel,
  Keyboard,
  EffectCreative,
  EffectCards,
  EffectFlip,
  EffectCoverflow,
  EffectCube,
  EffectFade
])

export interface NxWidgetSwiperOptions {
  width: number
  height: number
  direction: SwiperOptions['direction']
  slidesPerView: number
  spaceBetween: number
  centeredSlides: boolean
  grabCursor: boolean
  loop: boolean
  effect: SwiperOptions['effect']
  creativeEffect: SwiperOptions['creativeEffect']
  autoplay: SwiperOptions['autoplay']
  virtual: boolean
  mousewheel: SwiperOptions['mousewheel']
  breakpoints: Array<{
    size: number
    slidesPerView: number
    spaceBetween: number
  }>
  slides?: Array<any>
  pagination?: PaginationOptions
  keyboard?: SwiperOptions['keyboard']
}

export interface WidgetSwiperStyling extends StoryWidgetStyling {
  slide: ComponentStyling
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    IsNilPipe,
    AccountingIndicatorCardModule,
    WidgetAnalyticalCardModule,
    WidgetAnalyticalGridModule,
    PlaceholderAddComponent
  ],
  encapsulation: ViewEncapsulation.None,
  selector: 'pac-story-widget-swiper',
  templateUrl: './swiper.component.html',
  styleUrls: ['./swiper.component.scss'],
  host: {
    '[attr.tabindex]': 'disabled ? -1 : 0',
    '[attr.disabled]': 'disabled || null',
    '[attr.aria-disabled]': 'disabled?.toString()',
    class: 'pac-story-widget-swiper mat-focus-indicator'
  }
})
export class NxWidgetSwiperComponent extends AbstractStoryWidget<
  NxWidgetSwiperOptions,
  StoryWidgetState<NxWidgetSwiperOptions>,
  WidgetSwiperStyling
> {
  IndicatorCardWidgetType = IndicatorCardWidgetType
  WidgetComponentType = WidgetComponentType

  private _focusMonitor = inject(FocusMonitor)
  private elementRef = inject(ElementRef)
  private renderer = inject(Renderer2)

  public readonly focus$ = new BehaviorSubject<boolean>(false)

  public readonly swiperOptions$ = this.options$.pipe(map(cloneDeep))
  public slides$ = this.select((state) => state.options?.slides)

  public breakpoints$ = this.options$.pipe(
    map((options) => options?.breakpoints),
    map(cloneDeep),
    map((breakpoints: any[]) => {
      const result = {}
      breakpoints?.forEach((breakpoint) => {
        result[breakpoint.size] = breakpoint
      })
      return result
    })
  )

  public readonly slideStyling$ = computed(() => componentStyling(this.styling$()?.slide))

  constructor() {
    super()

    const element = this.elementRef.nativeElement
    this.renderer.listen(element, 'focus', () => {
      // Do something when the component receives focus
      this.focus$.next(true)
    })
    this.renderer.listen(element, 'blur', () => {
      // Do something when the component receives focus
      this.focus$.next(false)
    })
  }

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

  trackByKey(index: number, item: any) {
    return item?.key
  }

  onSwiper(swiper) {
    // console.log(swiper)
  }
  onSlideChange() {
    // console.log('slide change')
  }

  swipe(e: TouchEvent, when: string) {
    e.preventDefault()
    e.stopPropagation()
  }
}
