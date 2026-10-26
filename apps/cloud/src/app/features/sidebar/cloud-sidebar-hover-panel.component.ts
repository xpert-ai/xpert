import { DOCUMENT, NgTemplateOutlet } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  TemplateRef,
  inject,
  output,
  signal,
  viewChild
} from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardSearchInputComponent } from '@xpert-ai/headless-ui'
import type { SidebarPanelContext, SidebarPanelHeaderContext } from './cloud-sidebar-panel-trigger.directive'

let nextPanelId = 0

@Component({
  standalone: true,
  selector: 'xp-cloud-sidebar-hover-panel',
  imports: [TranslateModule, ZardSearchInputComponent, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block size-full pointer-events-none' },
  template: `
    <section
      [id]="id"
      role="region"
      [attr.aria-labelledby]="id + '-title'"
      [attr.aria-hidden]="!opened()"
      [attr.inert]="opened() ? null : ''"
      class="relative flex size-full flex-col overflow-hidden transition-[opacity,translate,border-radius,box-shadow,background-color,border-color] duration-200 ease-out motion-reduce:transition-none starting:-translate-x-2 starting:opacity-0"
      [class]="
        (pinned()
          ? 'rounded-l-[16px] border-r-[0.5px] border-border/50 bg-background text-foreground'
          : 'rounded-[14px] border border-border/50 bg-popover text-popover-foreground shadow-page') +
        ' ' +
        (opened() ? 'pointer-events-auto translate-x-0 opacity-100' : 'pointer-events-none -translate-x-2 opacity-0')
      "
      (pointerenter)="entered.emit()"
      (pointerleave)="left.emit()"
      (focusout)="blurred.emit()"
      (keydown.escape)="onEscape($event)"
    >
      <header class="flex min-h-14 shrink-0 items-center gap-1 px-3 py-2">
        @if (opened()) {
          <ng-container
            [ngTemplateOutlet]="headerContent()"
            [ngTemplateOutletContext]="{ assistant: assistantContext(), holdOpen: holdOpen }"
          />
        }
        <h2 [id]="id + '-title'" [title]="title()" class="min-w-0 flex-1 truncate pl-1 text-[16px] font-semibold">
          {{ title() }}
        </h2>
        <button
          #searchButton
          data-sidebar-panel-search
          type="button"
          class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:text-text-primary focus-visible:text-text-primary transition-colors duration-150 motion-reduce:transition-none hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          [class]="searchOpened() ? 'bg-hover-bg text-text-primary' : ''"
          [attr.aria-label]="'XP.KEY_WORDS.Search' | translate: { Default: 'Search' }"
          [title]="'XP.KEY_WORDS.Search' | translate: { Default: 'Search' }"
          [attr.aria-expanded]="searchOpened()"
          [attr.aria-controls]="id + '-search'"
          (click)="toggleSearch($event)"
        >
          <i
            class="ri-search-line inline-flex size-[20px] items-center justify-center text-[20px] leading-none"
            aria-hidden="true"
          ></i>
        </button>
        @if (canPin()) {
          <button
            type="button"
            data-sidebar-panel-pin
            class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-secondary hover:text-text-primary focus-visible:text-text-primary transition-colors duration-150 motion-reduce:transition-none hover:bg-hover-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            [attr.aria-label]="
              (pinned() ? 'XP.Sidebar.UnpinPanel' : 'XP.Sidebar.PinPanel')
                | translate: { Default: pinned() ? 'Unpin panel' : 'Pin panel' }
            "
            [title]="
              (pinned() ? 'XP.Sidebar.UnpinPanel' : 'XP.Sidebar.PinPanel')
                | translate: { Default: pinned() ? 'Unpin panel' : 'Pin panel' }
            "
            [attr.aria-pressed]="pinned()"
            [class]="pinned() ? 'text-text-primary!' : ''"
            (click)="togglePin($event)"
          >
            <i
              class="ri-side-bar-line inline-flex size-[20px] items-center justify-center text-[20px] leading-none"
              aria-hidden="true"
            ></i>
          </button>
        } @else {
          <button
            type="button"
            class="flex size-8 items-center justify-center rounded-lg hover:bg-hover-bg"
            [attr.aria-label]="'XP.ACTIONS.Close' | translate"
            (click)="dismissed.emit()"
          >
            <i
              class="ri-close-line inline-flex size-[20px] items-center justify-center text-[20px] leading-none"
              aria-hidden="true"
            ></i>
          </button>
        }
      </header>
      @if (searchOpened()) {
        <div [id]="id + '-search'" class="shrink-0 px-3 pb-3">
          <z-search-input
            #searchField
            [value]="searchQuery()"
            (valueChange)="updateSearch($event)"
            [placeholder]="'XP.KEY_WORDS.Search' | translate: { Default: 'Search' }"
            [aria-label]="('XP.KEY_WORDS.Search' | translate: { Default: 'Search' }) + ' ' + title()"
            [clearLabel]="'XP.ACTIONS.Clear' | translate: { Default: 'Clear search' }"
          />
        </div>
      }
      <div #body class="min-h-0 flex-1 overflow-y-auto px-2 pb-3" (click)="onContentClick($event)">
        <ng-container
          [ngTemplateOutlet]="content()"
          [ngTemplateOutletContext]="{ $implicit: searchQuery(), assistant: assistantContext() }"
        />
      </div>
      @if (pinned() && opened()) {
        <button
          type="button"
          role="separator"
          aria-orientation="vertical"
          [attr.aria-label]="'XP.Sidebar.Resize' | translate: { Default: 'Resize sidebar' }"
          [title]="'XP.Sidebar.ResizeHint' | translate: { Default: 'Drag or use the arrow keys to resize' }"
          [attr.aria-valuemin]="minWidth()"
          [attr.aria-valuemax]="maxWidth()"
          [attr.aria-valuenow]="width()"
          class="group absolute inset-y-0 right-0 flex w-2 cursor-col-resize touch-none select-none justify-end bg-transparent p-0 outline-none"
          (pointerdown)="startResize($event)"
          (lostpointercapture)="stopResize()"
          (keydown)="onResizeKeydown($event)"
        >
          <span
            class="h-full w-px transition-colors motion-reduce:transition-none"
            [class]="resizing() ? 'bg-primary' : 'bg-transparent group-hover:bg-primary group-focus-visible:bg-primary'"
          ></span>
        </button>
      }
    </section>
  `
})
export class CloudSidebarHoverPanelComponent implements OnDestroy {
  readonly id = `cloud-sidebar-hover-panel-${nextPanelId++}`
  readonly title = signal('')
  readonly opened = signal(false)
  readonly pinned = signal(false)
  readonly canPin = signal(true)
  readonly assistantContext = signal<SidebarPanelContext['assistant']>(undefined)
  readonly content = signal<TemplateRef<SidebarPanelContext> | null>(null)
  readonly headerContent = signal<TemplateRef<SidebarPanelHeaderContext> | null>(null)
  readonly interactionHeld = signal(false)
  readonly interactionHeldChange = output<boolean>()
  readonly holdOpen = (held: boolean) => {
    this.interactionHeld.set(held)
    this.interactionHeldChange.emit(held)
  }
  readonly dismissed = output<void>()
  readonly width = signal(268)
  readonly minWidth = signal(240)
  readonly maxWidth = signal(480)
  readonly resizing = signal(false)
  readonly searchOpened = signal(false)
  readonly searchQuery = signal('')
  readonly entered = output<void>()
  readonly left = output<void>()
  readonly blurred = output<void>()
  readonly pinToggled = output<void>()
  readonly widthChanged = output<number>()
  readonly resizingChanged = output<boolean>()
  readonly resizeEnded = output<void>()
  private readonly document = inject(DOCUMENT)
  private resizeSession?: {
    handle: HTMLElement
    pointerId: number
    startX: number
    startWidth: number
    cursor: string
    userSelect: string
  }
  private readonly changeDetector = inject(ChangeDetectorRef)
  private readonly searchField = viewChild('searchField', { read: ElementRef<HTMLElement> })
  private readonly searchButton = viewChild.required('searchButton', { read: ElementRef<HTMLButtonElement> })
  private readonly body = viewChild.required('body', { read: ElementRef<HTMLElement> })
  private contentKey = ''
  private readonly contentStates = new Map<string, { query: string; search: boolean; scroll: number }>()

  selectContent(
    key: string,
    template: TemplateRef<SidebarPanelContext> | null,
    assistant?: SidebarPanelContext['assistant'],
    header: TemplateRef<SidebarPanelHeaderContext> | null = null
  ) {
    this.assistantContext.set(assistant)
    this.headerContent.set(header)
    if (this.contentKey === key && this.content() === template) return
    if (this.contentKey) this.rememberContent()
    this.contentKey = key
    const state = this.contentStates.get(key)
    this.searchQuery.set(state?.query ?? '')
    this.searchOpened.set(state?.search ?? false)
    this.content.set(template)
    this.changeDetector.detectChanges()
    this.body().nativeElement.scrollTop = state?.scroll ?? 0
  }

  rememberContent() {
    if (this.contentKey)
      this.contentStates.set(this.contentKey, {
        query: this.searchQuery(),
        search: this.searchOpened(),
        scroll: this.body().nativeElement.scrollTop
      })
  }

  clearContent() {
    this.headerContent.set(null)
    this.interactionHeld.set(false)
    this.assistantContext.set(undefined)
    this.contentStates.clear()
    this.contentKey = ''
    this.content.set(null)
    this.resetSearch()
  }

  onContentClick(event: MouseEvent) {
    if (event.target instanceof Element && event.target.closest('[data-sidebar-panel-action]')) this.dismissed.emit()
  }

  toggleSearch(event?: MouseEvent) {
    if (this.searchOpened()) {
      this.resetSearch()
      if (event?.detail) this.searchButton().nativeElement.blur()
      else this.searchButton().nativeElement.focus()
    } else {
      this.searchOpened.set(true)
      this.changeDetector.detectChanges()
      this.searchField()?.nativeElement.querySelector('input')?.focus()
    }
  }

  updateSearch(value: string) {
    this.searchQuery.set(value)
    if (!value) this.searchField()?.nativeElement.querySelector('input')?.focus()
  }

  togglePin(event: MouseEvent) {
    this.stopResize()
    this.pinToggled.emit()
    // Pointer clicks should return to hover dismissal; keyboard users keep their focus target.
    if (!this.pinned() && event.detail > 0 && event.currentTarget instanceof HTMLElement) {
      event.currentTarget.blur()
    }
  }

  startResize(event: PointerEvent) {
    if (!this.pinned() || event.button !== 0 || !(event.currentTarget instanceof HTMLElement)) return
    event.preventDefault()
    event.stopPropagation()
    this.stopResize()
    const body = this.document.body
    this.resizeSession = {
      handle: event.currentTarget,
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: this.width(),
      cursor: body.style.cursor,
      userSelect: body.style.userSelect
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    body.style.cursor = 'col-resize'
    body.style.userSelect = 'none'
    this.resizing.set(true)
    this.resizingChanged.emit(true)
  }

  @HostListener('document:pointermove', ['$event'])
  onResizeMove(event: PointerEvent) {
    const session = this.resizeSession
    if (!session || event.pointerId !== session.pointerId) return
    event.preventDefault()
    this.widthChanged.emit(session.startWidth + event.clientX - session.startX)
  }

  @HostListener('document:pointerup', ['$event'])
  @HostListener('document:pointercancel', ['$event'])
  onResizeEnd(event: PointerEvent) {
    if (event.pointerId === this.resizeSession?.pointerId) this.stopResize()
  }

  @HostListener('window:blur')
  stopResize() {
    const session = this.resizeSession
    if (!session) return
    this.resizeSession = undefined
    this.document.body.style.cursor = session.cursor
    this.document.body.style.userSelect = session.userSelect
    if (session.handle.hasPointerCapture(session.pointerId)) session.handle.releasePointerCapture(session.pointerId)
    this.resizing.set(false)
    this.resizingChanged.emit(false)
    this.resizeEnded.emit()
  }

  onResizeKeydown(event: KeyboardEvent) {
    if (!this.pinned()) return
    const step = event.shiftKey ? 32 : 16
    let width: number
    switch (event.key) {
      case 'ArrowLeft':
        width = this.width() - step
        break
      case 'ArrowRight':
        width = this.width() + step
        break
      case 'Home':
        width = this.minWidth()
        break
      case 'End':
        width = this.maxWidth()
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    this.widthChanged.emit(width)
    this.resizeEnded.emit()
  }

  ngOnDestroy() {
    this.stopResize()
  }

  resetSearch() {
    this.searchQuery.set('')
    this.searchOpened.set(false)
  }

  onEscape(event: Event) {
    if (!this.searchOpened()) return
    event.preventDefault()
    event.stopPropagation()
    this.toggleSearch()
  }
}
