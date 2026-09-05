import { Overlay, type ConnectedPosition, type OverlayRef } from '@angular/cdk/overlay'
import { TemplatePortal } from '@angular/cdk/portal'
import { DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  effect,
  ElementRef,
  inject,
  input,
  output,
  Renderer2,
  signal,
  TemplateRef,
  ViewContainerRef,
  type OnDestroy
} from '@angular/core'
import { Subscription } from 'rxjs'
import { mergeClasses } from '../../utils/merge-classes'

export type ZardHoverCardPlacement = 'top' | 'bottom' | 'left' | 'right'
const positions: Record<ZardHoverCardPlacement, ConnectedPosition> = {
  top: { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
  bottom: { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
  left: { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -8 },
  right: { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 8 }
}
let nextId = 0

/** Adapted from Zard UI Hover Card (MIT), using the workspace theme and CDK.
 * https://zardui.com/docs/components/hover-card
 */
@Directive({
  selector: '[zHoverCard]',
  exportAs: 'zHoverCard',
  standalone: true,
  host: {
    '(mouseenter)': 'enter()',
    '(mouseleave)': 'leave()',
    '(focusin)': 'focusIn()',
    '(focusout)': 'scheduleClose()',
    '(keydown.escape)': 'escape($event)',
    '[attr.aria-expanded]': 'visible()',
    '[attr.aria-controls]': 'visible() ? id : null'
  }
})
export class ZardHoverCardDirective implements OnDestroy {
  private readonly overlay = inject(Overlay)
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly document = inject(DOCUMENT)
  private readonly renderer = inject(Renderer2)
  private readonly viewContainer = inject(ViewContainerRef)
  readonly zContent = input<TemplateRef<unknown>>()
  readonly zPlacement = input<ZardHoverCardPlacement>('bottom')
  readonly zOpenDelay = input(350)
  readonly zCloseDelay = input(300)
  readonly zVisible = input<boolean>()
  readonly zHoldOpen = input(false)
  readonly zVisibleChange = output<boolean>()
  readonly visible = signal(false)
  readonly id = `z-hover-card-${++nextId}`
  private ref?: OverlayRef
  private subscriptions = new Subscription()
  private listeners: (() => void)[] = []
  private openTimer?: ReturnType<typeof setTimeout>
  private closeTimer?: ReturnType<typeof setTimeout>
  private pointerInside = false
  private pinned = false
  private restoringFocus = false
  private contentFactory?: (overlay: OverlayRef) => void
  private hold = false
  private returnFocus?: HTMLElement

  constructor() {
    effect(() => {
      const visible = this.zVisible()
      if (visible === true) this.open()
      else if (visible === false) this.close(false)
    })
    effect(() => {
      if (!this.zHoldOpen()) this.scheduleClose()
    })
  }

  /** Component portals let application-specific triggers reuse the same interaction primitive. */
  setContentFactory(factory: (overlay: OverlayRef) => void) {
    this.contentFactory = factory
  }
  setHoldOpen(hold: boolean) {
    this.hold = hold
    if (!hold) this.scheduleClose()
  }

  enter() {
    this.pointerInside = true
    this.clearClose()
    if (!this.visible()) {
      clearTimeout(this.openTimer)
      this.openTimer = setTimeout(() => this.open(), this.zOpenDelay())
    }
  }
  leave() {
    this.pointerInside = false
    this.scheduleClose()
  }
  focusIn() {
    if (this.restoringFocus) return
    this.clearTimers()
    if (!this.visible()) this.openTimer = setTimeout(() => this.open(), this.zOpenDelay())
  }

  open(pinned = false) {
    this.clearTimers()
    this.pinned ||= pinned
    if (this.visible()) return
    this.returnFocus = this.document.activeElement instanceof HTMLElement ? this.document.activeElement : undefined
    const placement = this.zPlacement()
    this.ref = this.overlay.create({
      positionStrategy: this.overlay
        .position()
        .flexibleConnectedTo(this.element)
        .withPositions([
          positions[placement],
          ...Object.entries(positions)
            .filter(([key]) => key !== placement)
            .map(([, value]) => value)
        ])
        .withPush(true)
        .withFlexibleDimensions(false)
        .withViewportMargin(8),
      scrollStrategy: this.overlay.scrollStrategies.reposition(),
      hasBackdrop: false
    })
    if (this.contentFactory) this.contentFactory(this.ref)
    else if (this.zContent()) this.ref.attach(new TemplatePortal(this.zContent()!, this.viewContainer))
    else {
      this.ref.dispose()
      this.ref = undefined
      return
    }
    if (!this.ref.hasAttached()) {
      this.ref.dispose()
      this.ref = undefined
      return
    }
    this.ref.overlayElement.id = this.id
    const pane = this.ref.overlayElement
    this.listeners = [
      this.renderer.listen(pane, 'mouseenter', () => this.enter()),
      this.renderer.listen(pane, 'mouseleave', () => this.leave()),
      this.renderer.listen(pane, 'focusin', () => this.clearClose()),
      this.renderer.listen(pane, 'focusout', () => this.scheduleClose()),
      this.renderer.listen(this.document.defaultView, 'focus', () => this.scheduleClose())
    ]
    this.subscriptions.add(this.ref.keydownEvents().subscribe((event) => this.escape(event)))
    this.subscriptions.add(
      this.ref.outsidePointerEvents().subscribe((event) => {
        if (!this.element.nativeElement.contains(event.target as Node) && !this.isHeld()) this.close(false)
      })
    )
    this.visible.set(true)
    this.zVisibleChange.emit(true)
  }

  close(restoreFocus = true) {
    this.clearTimers()
    this.pinned = false
    this.hold = false
    if (!this.visible()) return
    this.visible.set(false)
    this.listeners.splice(0).forEach((dispose) => dispose())
    this.subscriptions.unsubscribe()
    this.subscriptions = new Subscription()
    this.ref?.dispose()
    this.ref = undefined
    this.zVisibleChange.emit(false)
    if (restoreFocus) {
      this.restoringFocus = true
      const target =
        this.returnFocus?.isConnected && this.element.nativeElement.contains(this.returnFocus)
          ? this.returnFocus
          : (this.element.nativeElement.querySelector<HTMLElement>('button, a, [tabindex]') ??
            this.element.nativeElement)
      target.focus({ preventScroll: true })
      this.restoringFocus = false
    }
  }

  escape(event: Event) {
    if (!(event instanceof KeyboardEvent)) return
    if (event.key !== 'Escape' || event.defaultPrevented || this.isHeld()) return
    event.preventDefault()
    event.stopPropagation()
    this.close()
  }

  scheduleClose() {
    clearTimeout(this.openTimer)
    this.clearClose()
    if (!this.visible()) return
    this.closeTimer = setTimeout(() => {
      const active = this.document.activeElement
      const focused =
        active && (this.element.nativeElement.contains(active) || this.ref?.overlayElement.contains(active))
      if (!this.pointerInside && !focused && !this.pinned && this.zVisible() !== true && !this.isHeld())
        this.close(false)
    }, this.zCloseDelay())
  }

  private isHeld() {
    return this.hold || this.zHoldOpen() || !!this.document.querySelector('[role="alertdialog"]')
  }
  private clearClose() {
    clearTimeout(this.closeTimer)
  }
  private clearTimers() {
    clearTimeout(this.openTimer)
    this.clearClose()
  }
  ngOnDestroy() {
    this.close(false)
    this.clearTimers()
  }
}

@Component({
  selector: 'z-hover-card',
  standalone: true,
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-slot': 'hover-card-content', '[class]': 'classes()' }
})
export class ZardHoverCardComponent {
  readonly class = input('')
  protected readonly classes = computed(() =>
    mergeClasses(
      'block w-64 rounded-xl border border-divider-regular bg-components-card-bg p-4 text-text-primary shadow-lg outline-none',
      this.class()
    )
  )
}
