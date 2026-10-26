import { Overlay, OverlayRef } from '@angular/cdk/overlay'
import { ComponentPortal } from '@angular/cdk/portal'
import { DOCUMENT } from '@angular/common'
import {
  ComponentRef,
  Directive,
  ElementRef,
  HostListener,
  OnChanges,
  OnDestroy,
  ViewContainerRef,
  inject,
  input,
  output
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationStart, Router } from '@angular/router'
import { CloudSidebarHoverPanelComponent } from './cloud-sidebar-hover-panel.component'

const TRIGGER_SELECTOR = 'button[data-sidebar-panel-title]'
export const SIDEBAR_PANEL_WIDTH_STORAGE_KEY = 'xpert.cloud-sidebar.panel-width'
const DEFAULT_WIDTH = 268
const MIN_WIDTH = 240
const MAX_WIDTH = 480

/** One portal per sidebar: switching triggers updates its title without remounting or moving it. */
@Directive({ standalone: true, selector: '[xpSidebarHoverPanel]' })
export class CloudSidebarHoverPanelDirective implements OnChanges, OnDestroy {
  readonly xpSidebarHoverPanel = input(false)
  readonly pinnedPanelWidthChange = output<number>()
  readonly panelResizingChange = output<boolean>()
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
  private readonly overlay = inject(Overlay)
  private readonly viewContainerRef = inject(ViewContainerRef)
  private readonly document = inject(DOCUMENT)
  private preferredWidth = this.readWidth()
  private overlayRef?: OverlayRef
  private panel?: ComponentRef<CloudSidebarHoverPanelComponent>
  private trigger?: HTMLElement
  private openTimer?: ReturnType<typeof setTimeout>
  private closeTimer?: ReturnType<typeof setTimeout>
  private panelHovered = false
  private pinnedWidth = 0

  constructor() {
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) this.close()
      })
  }

  ngOnChanges() {
    if (!this.xpSidebarHoverPanel()) this.close(false, true)
  }

  @HostListener('pointerover', ['$event'])
  onPointerOver(event: PointerEvent) {
    if (!this.xpSidebarHoverPanel() || event.pointerType !== 'mouse' || this.panel?.instance.pinned()) return
    const trigger = this.findTrigger(event.target)
    if (!trigger || trigger === this.findTrigger(event.relatedTarget)) return
    this.cancelTimers()
    if (this.panel?.instance.opened()) {
      this.show(trigger)
    } else {
      this.openTimer = setTimeout(() => this.show(trigger), 120)
    }
  }

  @HostListener('pointerout', ['$event'])
  onPointerOut(event: PointerEvent) {
    const trigger = this.findTrigger(event.target)
    if (trigger && trigger !== this.findTrigger(event.relatedTarget)) this.scheduleClose()
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (!this.xpSidebarHoverPanel() || event.key !== 'ArrowRight') return
    const trigger = this.findTrigger(event.target)
    if (!trigger) return
    event.preventDefault()
    this.show(trigger)
    this.panel?.location.nativeElement.querySelector('button')?.focus()
  }

  @HostListener('document:keydown', ['$event'])
  onDocumentKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && this.panel?.instance.opened() && !this.panel.instance.pinned()) {
      event.preventDefault()
      this.close(true)
    }
  }

  @HostListener('document:pointerdown', ['$event'])
  onPointerDown(event: PointerEvent) {
    if (!this.containsPanel(event.target)) this.close()
  }

  @HostListener('click')
  onClick() {
    // Leave existing navigation and click-to-open menus in charge after a click.
    this.close()
  }

  @HostListener('window:resize')
  onResize() {
    if (this.panel?.instance.opened()) this.positionPanel()
  }

  @HostListener('window:blur')
  onWindowBlur() {
    this.close()
  }

  ngOnDestroy() {
    this.cancelTimers()
    this.panel?.instance.stopResize()
    this.updatePinnedWidth(0)
    this.overlayRef?.dispose()
  }

  private findTrigger(target: EventTarget | null) {
    const trigger = target instanceof Element ? target.closest<HTMLElement>(TRIGGER_SELECTOR) : null
    return trigger && this.host.contains(trigger) ? trigger : null
  }

  private show(trigger: HTMLElement) {
    this.cancelTimers()
    if (!this.xpSidebarHoverPanel() || !trigger.isConnected) return
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        positionStrategy: this.overlay.position().global(),
        scrollStrategy: this.overlay.scrollStrategies.noop(),
        panelClass: [
          'transition-[width,height,margin-left,margin-top]',
          'duration-200',
          'ease-out',
          'motion-reduce:transition-none'
        ]
      })
      // Keep the empty portal mounted, including during its exit transition, but never intercept input when closed.
      this.overlayRef.overlayElement.style.pointerEvents = 'none'
      this.panel = this.overlayRef.attach(new ComponentPortal(CloudSidebarHoverPanelComponent, this.viewContainerRef))
      this.panel.instance.entered.subscribe(() => {
        this.panelHovered = true
        this.cancelTimers()
      })
      this.panel.instance.left.subscribe(() => {
        this.panelHovered = false
        this.scheduleClose()
      })
      this.panel.instance.pinToggled.subscribe(() => this.togglePinned())
      this.panel.instance.blurred.subscribe(() => this.scheduleClose())
      this.panel.instance.widthChanged.subscribe((width) => {
        if (!this.panel?.instance.pinned()) return
        this.preferredWidth = Math.round(
          Math.max(this.panel.instance.minWidth(), Math.min(this.panel.instance.maxWidth(), width))
        )
        this.positionPanel()
      })
      this.panel.instance.resizingChanged.subscribe((resizing) => {
        if (this.overlayRef) this.overlayRef.overlayElement.style.transitionDuration = resizing ? '0s' : ''
        this.panelResizingChange.emit(resizing)
      })
      this.panel.instance.resizeEnded.subscribe(() => this.persistWidth())
    }
    if (!this.panel) return
    if (trigger !== this.trigger) this.panel.instance.resetSearch()
    this.trigger?.classList.remove('bg-hover-bg')
    this.trigger = trigger
    this.trigger.classList.add('bg-hover-bg')
    this.panel.instance.title.set(trigger.getAttribute('data-sidebar-panel-title') ?? '')
    this.positionPanel()
    this.panel.instance.opened.set(true)
    this.panel.changeDetectorRef.detectChanges()
  }

  private positionPanel() {
    const viewport = this.document.documentElement
    const bounds = this.host.getBoundingClientRect()
    const pinned = this.panel?.instance.pinned() ?? false
    const inset = pinned ? 0 : 4
    const left = Math.min(bounds.right + inset, viewport.clientWidth - inset)
    const top = Math.max(inset, bounds.top + inset)
    this.overlayRef?.updatePositionStrategy(this.overlay.position().global().left(`${left}px`).top(`${top}px`))
    // Preserve the preference when the viewport shrinks; leave usable space for the page.
    const maxWidth = Math.max(0, Math.min(MAX_WIDTH, viewport.clientWidth - bounds.right - 320))
    const minWidth = Math.min(MIN_WIDTH, maxWidth)
    const fullWidth = Math.max(minWidth, Math.min(this.preferredWidth, maxWidth))
    // Pinning fills the floating inset while keeping the panel's right edge in place.
    const width = Math.max(0, fullWidth - inset)
    this.overlayRef?.updateSize({
      width,
      height: Math.max(0, Math.min(bounds.bottom, viewport.clientHeight) - top - inset)
    })
    this.panel?.instance.width.set(fullWidth)
    this.panel?.instance.minWidth.set(minWidth)
    this.panel?.instance.maxWidth.set(maxWidth)
    this.updatePinnedWidth(pinned ? width : 0)
  }

  private readWidth() {
    try {
      const width = Number(this.document.defaultView?.localStorage.getItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY))
      return Number.isFinite(width) && width > 0
        ? Math.round(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width)))
        : DEFAULT_WIDTH
    } catch {
      return DEFAULT_WIDTH
    }
  }

  private persistWidth() {
    try {
      this.document.defaultView?.localStorage.setItem(SIDEBAR_PANEL_WIDTH_STORAGE_KEY, String(this.preferredWidth))
    } catch {
      // Resizing remains available when browser storage is restricted.
    }
  }

  private togglePinned() {
    this.cancelTimers()
    this.panel?.instance.pinned.update((pinned) => !pinned)
    this.positionPanel()
  }

  private updatePinnedWidth(width: number) {
    if (width === this.pinnedWidth) return
    this.pinnedWidth = width
    this.pinnedPanelWidthChange.emit(width)
  }

  private scheduleClose() {
    this.cancelTimers()
    this.closeTimer = setTimeout(() => {
      if (!this.panelHovered && !this.containsPanel(this.document.activeElement)) this.close()
    }, 180)
  }

  private containsPanel(target: EventTarget | null) {
    return target instanceof Node && !!this.overlayRef?.overlayElement.contains(target)
  }

  private close(restoreFocus = false, force = false) {
    this.cancelTimers()
    if (this.panel?.instance.pinned() && !force) return
    this.panel?.instance.stopResize()
    if (restoreFocus && this.containsPanel(this.document.activeElement)) this.trigger?.focus()
    this.panelHovered = false
    this.trigger?.classList.remove('bg-hover-bg')
    this.trigger = undefined
    this.panel?.instance.pinned.set(false)
    this.panel?.instance.resetSearch()
    this.panel?.instance.opened.set(false)
    this.updatePinnedWidth(0)
  }

  private cancelTimers() {
    clearTimeout(this.openTimer)
    clearTimeout(this.closeTimer)
    this.openTimer = undefined
    this.closeTimer = undefined
  }
}
