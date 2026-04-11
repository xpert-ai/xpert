import { Overlay, OverlayPositionBuilder, type OverlayRef } from '@angular/cdk/overlay'
import { ComponentPortal } from '@angular/cdk/portal'
import { isPlatformBrowser, DOCUMENT } from '@angular/common'
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  type ComponentRef,
  computed,
  DestroyRef,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  numberAttribute,
  type OnDestroy,
  type OnInit,
  output,
  PLATFORM_ID,
  Renderer2,
  runInInjectionContext,
  signal,
  type TemplateRef,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import type { ClassValue } from 'clsx'

import { filter, map, of, Subject, switchMap, tap, timer } from 'rxjs'

import { TOOLTIP_POSITIONS_MAP } from '@/shared/components/tooltip/tooltip-positions'
import {
  tooltipPositionVariants,
  tooltipVariants,
  type ZardTooltipPositionVariants
} from '@/shared/components/tooltip/tooltip.variants'
import { ZardIdDirective } from '@/shared/core'
import { ZardStringTemplateOutletDirective } from '@/shared/core/directives/string-template-outlet/string-template-outlet.directive'
import { mergeClasses } from '@/shared/utils/merge-classes'

export type ZardTooltipTriggers = 'click' | 'hover'
export type ZardTooltipType = string | TemplateRef<void> | null

interface DelayConfig {
  isShow: boolean
  delay: number
}

const throttle = (callback: () => void, wait: number) => {
  let time = Date.now()
  return function () {
    if (time + wait - Date.now() < 0) {
      callback()
      time = Date.now()
    }
  }
}

@Directive({
  selector: '[zTooltip]',
  exportAs: 'zTooltip'
})
export class ZardTooltipDirective implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef)
  private readonly document = inject(DOCUMENT)
  private readonly elementRef = inject(ElementRef<HTMLElement>)
  private readonly injector = inject(Injector)
  private readonly overlay = inject(Overlay)
  private readonly overlayPositionBuilder = inject(OverlayPositionBuilder)
  private readonly platformId = inject(PLATFORM_ID)
  private readonly renderer = inject(Renderer2)

  private delaySubject?: Subject<DelayConfig>
  private componentRef?: ComponentRef<ZardTooltipComponent>
  private listenersRefs: (() => void)[] = []
  private overlayRef?: OverlayRef
  private ariaEffectRef?: ReturnType<typeof effect>

  readonly zPosition = input<ZardTooltipPositionVariants>('top')
  readonly zTrigger = input<ZardTooltipTriggers>('hover')
  readonly zTooltip = input<ZardTooltipType>(null)
  readonly zTooltipClass = input<ClassValue>('')
  readonly zDisabled = input(false, { transform: booleanAttribute })
  readonly zShowDelay = input(150, { transform: numberAttribute })
  readonly zHideDelay = input(100, { transform: numberAttribute })

  readonly zShow = output<void>()
  readonly zHide = output<void>()

  private readonly tooltipText = computed<string | TemplateRef<void>>(() => {
    let tooltipText = this.zTooltip()
    if (!tooltipText) {
      return ''
    } else if (typeof tooltipText === 'string') {
      tooltipText = tooltipText.trim()
    }
    return tooltipText
  })
  private readonly tooltipClass = computed<ClassValue>(() => this.zTooltipClass())
  private readonly tooltipPosition = computed<ZardTooltipPositionVariants>(() => this.zPosition())
  private readonly isDisabled = computed(() => this.zDisabled())
  private readonly showDelay = computed(() => this.zShowDelay())
  private readonly hideDelay = computed(() => this.zHideDelay())

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const positionStrategy = this.overlayPositionBuilder
        .flexibleConnectedTo(this.elementRef)
        .withPositions([TOOLTIP_POSITIONS_MAP[this.tooltipPosition()]])
      this.overlayRef = this.overlay.create({ positionStrategy })

      runInInjectionContext(this.injector, () => {
        toObservable(this.tooltipPosition)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((position) => {
            if (!this.overlayRef.hasAttached()) {
              return;
            }
            this.overlayRef?.updatePositionStrategy(
              this.overlayPositionBuilder
                .flexibleConnectedTo(this.elementRef)
                .withPositions([TOOLTIP_POSITIONS_MAP[position]])
            )
            this.componentRef?.instance.setProps(this.tooltipText(), position, this.tooltipClass())
            this.overlayRef?.updatePosition()
          })

        toObservable(this.isDisabled)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe((isDisabled) => {
            if (isDisabled) {
              this.hide()
            }
          })

        toObservable(this.zTrigger)
          .pipe(
            tap(() => {
              this.setupDelayMechanism()
              this.cleanupTriggerEvents()
              this.initTriggers()
            }),
            filter(() => !!this.overlayRef),
            switchMap(() => (this.overlayRef as OverlayRef).outsidePointerEvents()),
            filter((event) => !this.elementRef.nativeElement.contains(event.target)),
            takeUntilDestroyed(this.destroyRef)
          )
          .subscribe(() => this.delay(false, 0))
      })
    }
  }

  ngOnDestroy(): void {
    // Clean up any pending effect
    if (this.ariaEffectRef) {
      this.ariaEffectRef.destroy()
      this.ariaEffectRef = undefined
    }

    this.delaySubject?.complete()
    this.cleanupTriggerEvents()
    this.overlayRef?.dispose()
  }

  private initTriggers() {
    this.initScrollListener()
    this.initClickListeners()
    this.initHoverListeners()
  }

  private initClickListeners(): void {
    if (this.zTrigger() !== 'click') {
      return
    }

    this.listenersRefs = [
      ...this.listenersRefs,
      this.renderer.listen(this.elementRef.nativeElement, 'click', () => {
        if (this.isDisabled()) {
          return
        }
        const shouldShowTooltip = !this.overlayRef?.hasAttached()
        const delay = shouldShowTooltip ? this.showDelay() : this.hideDelay()
        this.delay(shouldShowTooltip, delay)
      })
    ]
  }

  private initHoverListeners(): void {
    if (this.zTrigger() !== 'hover') {
      return
    }

    this.listenersRefs = [
      ...this.listenersRefs,
      this.renderer.listen(this.elementRef.nativeElement, 'mouseenter', () => {
        if (!this.isDisabled()) {
          this.delay(true, this.showDelay())
        }
      }),
      this.renderer.listen(this.elementRef.nativeElement, 'mouseleave', () => this.delay(false, this.hideDelay())),
      this.renderer.listen(this.elementRef.nativeElement, 'focus', () => {
        if (!this.isDisabled()) {
          this.delay(true, this.showDelay())
        }
      }),
      this.renderer.listen(this.elementRef.nativeElement, 'blur', () => this.delay(false, this.hideDelay()))
    ]
  }

  private initScrollListener(): void {
    this.listenersRefs = [
      ...this.listenersRefs,
      this.renderer.listen(
        this.document.defaultView,
        'scroll',
        throttle(() => this.delay(false, 0), 100)
      )
    ]
  }

  private cleanupTriggerEvents(): void {
    for (const eventRef of this.listenersRefs) {
      eventRef()
    }
    this.listenersRefs = []
  }

  private delay(isShow: boolean, delay = -1): void {
    this.delaySubject?.next({ isShow, delay })
  }

  private setupDelayMechanism(): void {
    this.delaySubject?.complete()
    this.delaySubject = new Subject<DelayConfig>()

    this.delaySubject
      .pipe(
        switchMap((config) => (config.delay < 0 ? of(config) : timer(config.delay).pipe(map(() => config)))),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((config) => {
        if (config.isShow) {
          this.show()
        } else {
          this.hide()
        }
      })
  }

  private show() {
    if (this.componentRef || !this.tooltipText() || this.isDisabled()) {
      return
    }

    const tooltipPortal = new ComponentPortal(ZardTooltipComponent)
    this.componentRef = this.overlayRef?.attach(tooltipPortal)
    this.componentRef?.onDestroy(() => {
      this.componentRef = undefined
    })
    this.componentRef?.instance.state.set('opened')
    this.componentRef?.instance.setProps(this.tooltipText(), this.tooltipPosition(), this.tooltipClass())
    runInInjectionContext(this.injector, () => {
      this.ariaEffectRef = effect(() => {
        const tooltipId = this.componentRef?.instance.uniqueId()?.id()
        if (tooltipId) {
          this.renderer.setAttribute(this.elementRef.nativeElement, 'aria-describedby', tooltipId)
          this.ariaEffectRef?.destroy()
          this.ariaEffectRef = undefined
        }
      })
    })
    this.zShow.emit()
  }

  private hide() {
    if (!this.componentRef) {
      return
    }

    // Clean up any pending effect
    if (this.ariaEffectRef) {
      this.ariaEffectRef.destroy()
      this.ariaEffectRef = undefined
    }

    this.renderer.removeAttribute(this.elementRef.nativeElement, 'aria-describedby')
    this.componentRef.instance.state.set('closed')
    this.zHide.emit()
    this.overlayRef?.detach()
  }

  open() {
    this.delay(true, 0)
  }

  close() {
    this.delay(false, 0)
  }
}

@Component({
  selector: 'z-tooltip',
  imports: [ZardStringTemplateOutletDirective, ZardIdDirective],
  template: `
    <ng-container *zStringTemplateOutlet="tooltipText()" zardId="tooltip" #z="zardId">{{ tooltipText() }}</ng-container>

    <span [class]="arrowClasses()">
      <svg
        class="bg-foreground fill-foreground z-50 block size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px]"
        width="10"
        height="5"
        viewBox="0 0 30 10"
        preserveAspectRatio="none"
      >
        <polygon points="0,0 30,0 15,10" />
      </svg>
    </span>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '[attr.id]': 'tooltipId()',
    '[attr.data-side]': 'position()',
    '[attr.data-state]': 'state()',
    role: 'tooltip'
  }
})
export class ZardTooltipComponent {
  protected readonly arrowClasses = computed(() => mergeClasses(tooltipPositionVariants({ position: this.position() })))

  readonly class = signal<ClassValue>('')
  protected readonly classes = computed(() => mergeClasses(tooltipVariants(), this.class()))
  protected readonly position = signal<ZardTooltipPositionVariants>('top')
  readonly state = signal<'closed' | 'opened'>('closed')
  readonly uniqueId = viewChild<ZardIdDirective>('z')
  protected readonly tooltipText = signal<ZardTooltipType>(null)
  protected readonly tooltipId = computed(() => this.uniqueId()?.id() ?? 'tooltip')

  setProps(tooltipText: ZardTooltipType, position: ZardTooltipPositionVariants, customClass: ClassValue = '') {
    if (tooltipText) {
      this.tooltipText.set(tooltipText)
    }
    this.position.set(position)
    this.class.set(customClass)
  }
}
