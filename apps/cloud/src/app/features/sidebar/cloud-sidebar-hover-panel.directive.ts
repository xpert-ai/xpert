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
  SimpleChanges,
  TemplateRef,
  ViewContainerRef,
  inject,
  input,
  output,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { NavigationStart, Router } from '@angular/router'
import { CloudSidebarHoverPanelComponent } from './cloud-sidebar-hover-panel.component'
import type { SidebarPanelContext, SidebarPanelHeaderContext } from './cloud-sidebar-panel-trigger.directive'

const TRIGGER_SELECTOR = '[data-sidebar-panel-title]'
export const SIDEBAR_PANEL_WIDTH_STORAGE_KEY = 'xpert.cloud-sidebar.panel-width'
const DEFAULT_WIDTH = 268
const MIN_WIDTH = 240
const MAX_WIDTH = 480

/** One overlay per sidebar. Hover previews, explicit clicks switch even when pinned; scope changes discard content. */
@Directive({ standalone: true, selector: '[xpSidebarHoverPanel]' })
export class CloudSidebarHoverPanelDirective implements OnChanges, OnDestroy {
  readonly xpSidebarHoverPanel = input(false)
  readonly xpSidebarPanelMobile = input(false)
  readonly xpSidebarPanelScope = input('')
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
  private readonly activeTrigger = signal<HTMLElement | undefined>(undefined)
  private focusReturnTrigger?: HTMLElement
  private primaryTrigger = false
  private openTimer?: ReturnType<typeof setTimeout>
  private closeTimer?: ReturnType<typeof setTimeout>
  private panelHovered = false
  private pinnedWidth = 0
  private readonly sidebarResizeObserver =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => this.onResize())
  private readonly entries = new Map<
    HTMLElement,
    () => {
      key: string
      template: TemplateRef<SidebarPanelContext> | null
      assistant?: SidebarPanelContext['assistant']
      header?: TemplateRef<SidebarPanelHeaderContext> | null
      activate: () => void
    }
  >()

  register(
    element: HTMLElement,
    entry: () => {
      key: string
      template: TemplateRef<SidebarPanelContext> | null
      assistant?: SidebarPanelContext['assistant']
      header?: TemplateRef<SidebarPanelHeaderContext> | null
      activate: () => void
    }
  ) {
    this.entries.set(element, entry)
  }

  unregister(element: HTMLElement) {
    this.entries.delete(element)
    if (this.trigger === element && this.primaryTrigger) {
      this.close(false, true)
      this.panel?.instance.clearContent()
    }
  }

  openRegistered(element: HTMLElement) {
    if (!this.xpSidebarHoverPanel() || !this.entries.get(element)?.().template) return false
    this.show(element)
    this.panel?.location.nativeElement.querySelector('[data-sidebar-panel-search]')?.focus()
    return true
  }

  isTriggerOpen(element: HTMLElement) {
    return this.activeTrigger() === element && !!this.panel?.instance.opened()
  }

  get panelId() {
    return this.panel?.instance.id ?? null
  }

  constructor() {
    // Sidebar expansion and dragging change the anchor without resizing the window.
    this.sidebarResizeObserver?.observe(this.host)
    inject(Router)
      .events.pipe(takeUntilDestroyed())
      .subscribe((event) => {
        if (event instanceof NavigationStart) this.close()
      })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (!this.xpSidebarHoverPanel() || changes['xpSidebarPanelScope'] || changes['xpSidebarPanelMobile']) {
      this.close(false, true)
      this.panel?.instance.clearContent()
    }
  }

  @HostListener('pointerover', ['$event'])
  onPointerOver(event: PointerEvent) {
    if (
      !this.xpSidebarHoverPanel() ||
      this.xpSidebarPanelMobile() ||
      event.pointerType !== 'mouse' ||
      this.panel?.instance.pinned()
    )
      return
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
    this.panel?.location.nativeElement.querySelector('[data-sidebar-panel-search]')?.focus()
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
    if (!this.containsPanel(event.target) && !this.findTrigger(event.target)) this.close()
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    const trigger = this.findTrigger(event.target)
    if (trigger && this.entries.get(trigger)?.().template && this.xpSidebarHoverPanel()) {
      event.preventDefault()
      this.show(trigger)
      this.panel?.location.nativeElement.querySelector('[data-sidebar-panel-search]')?.focus()
    } else this.close()
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
    this.sidebarResizeObserver?.disconnect()
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
      this.panel = this.overlayRef.attach(new ComponentPortal(CloudSidebarHoverPanelComponent, this.viewContainerRef))
      // CDK attach resets the pane's pointer events. Only the visible panel content should accept input;
      // the retained outer pane must stay transparent to input during closing and sidebar expansion.
      this.overlayRef.overlayElement.style.pointerEvents = 'none'
      this.panel.instance.entered.subscribe(() => {
        this.panelHovered = true
        this.cancelTimers()
      })
      this.panel.instance.left.subscribe(() => {
        this.panelHovered = false
        this.scheduleClose()
      })
      this.panel.instance.pinToggled.subscribe(() => this.togglePinned())
      this.panel.instance.dismissed.subscribe(() => this.close())
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
      this.panel.instance.interactionHeldChange.subscribe((held) => {
        if (held) this.cancelTimers()
        else if (this.panel?.instance.opened()) this.scheduleClose()
      })
    }
    if (!this.panel) return
    const changed = trigger !== this.trigger
    this.trigger?.classList.remove('bg-hover-bg')
    this.trigger = trigger
    this.activeTrigger.set(trigger)
    if (this.host.contains(trigger)) this.focusReturnTrigger = trigger
    this.primaryTrigger = this.host.contains(trigger)
    this.trigger.classList.add('bg-hover-bg')
    const entry = this.entries.get(trigger)?.()
    if (entry?.template) {
      // Activate before swapping content: a directory trigger can be destroyed by the swap.
      entry.activate()
      this.panel.instance.selectContent(entry.key, entry.template, entry.assistant, entry.header)
    } else if (changed) {
      this.panel.instance.selectContent('', null)
      this.panel.instance.resetSearch()
    }
    this.panel.instance.title.set(trigger.getAttribute('data-sidebar-panel-title') ?? '')
    this.positionPanel()
    this.panel.instance.opened.set(true)
    this.panel.changeDetectorRef.detectChanges()
  }

  private positionPanel() {
    const viewport = this.document.documentElement
    const bounds = this.host.getBoundingClientRect()
    if (this.xpSidebarPanelMobile()) {
      this.panel?.instance.canPin.set(false)
      this.overlayRef?.updatePositionStrategy(this.overlay.position().global().left('8px').top('8px'))
      this.overlayRef?.updateSize({
        width: Math.max(0, viewport.clientWidth - 16),
        height: Math.max(0, viewport.clientHeight - 16)
      })
      this.updatePinnedWidth(0)
      return
    }
    this.panel?.instance.canPin.set(true)
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
    if (!force && (this.panel?.instance.pinned() || this.panel?.instance.interactionHeld())) return
    this.panel?.instance.stopResize()
    this.panel?.instance.rememberContent()
    if (restoreFocus && this.containsPanel(this.document.activeElement)) this.focusReturnTrigger?.focus()
    this.panelHovered = false
    this.trigger?.classList.remove('bg-hover-bg')
    this.trigger = undefined
    this.activeTrigger.set(undefined)
    this.panel?.instance.pinned.set(false)
    if (!this.panel?.instance.content()) this.panel?.instance.resetSearch()
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
