import {
  afterNextRender,
  type AfterViewInit,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  inject,
  Injector,
  input,
  runInInjectionContext,
  signal,
  viewChild,
  ViewEncapsulation
} from '@angular/core'

import { ZardIconComponent } from '../icon/icon.component'

@Component({
  selector: 'z-tab-nav-scroll',
  exportAs: 'zTabNavScroll',
  imports: [ZardIconComponent],
  template: `
    <div #container data-slot="tab-nav-scroll" class="flex min-w-0 items-center">
      @if (showArrow()) {
        <button
          type="button"
          data-slot="tab-nav-scroll-previous"
          class="flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-30"
          [attr.aria-label]="previousLabel()"
          [title]="previousLabel()"
          [disabled]="!canScrollBackward()"
          (click)="scrollNav('backward')"
        >
          <z-icon zType="chevron-left" aria-hidden="true" />
        </button>
      }

      <div
        #viewport
        data-slot="tab-nav-scroll-viewport"
        class="z-tab-nav-scroll__viewport min-w-0 flex-1 overflow-x-auto overflow-y-hidden"
        (scroll)="syncScrollState()"
      >
        <div #content class="w-max min-w-full">
          <ng-content />
        </div>
      </div>

      @if (showArrow()) {
        <button
          type="button"
          data-slot="tab-nav-scroll-next"
          class="flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-30"
          [attr.aria-label]="nextLabel()"
          [title]="nextLabel()"
          [disabled]="!canScrollForward()"
          (click)="scrollNav('forward')"
        >
          <z-icon zType="chevron-right" aria-hidden="true" />
        </button>
      }
    </div>
  `,
  styles: `
    .z-tab-nav-scroll__viewport {
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      scrollbar-width: none;
    }

    .z-tab-nav-scroll__viewport::-webkit-scrollbar {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      .z-tab-nav-scroll__viewport {
        scroll-behavior: auto;
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'block min-w-0'
  }
})
export class ZardTabNavScrollComponent implements AfterViewInit {
  private readonly container = viewChild.required<ElementRef<HTMLElement>>('container')
  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport')
  private readonly content = viewChild.required<ElementRef<HTMLElement>>('content')
  private readonly destroyRef = inject(DestroyRef)
  private readonly injector = inject(Injector)
  private readonly window = inject(DOCUMENT).defaultView

  readonly zShowArrow = input(true, { transform: booleanAttribute })
  readonly zScrollAmount = input(240)
  readonly previousLabel = input('Scroll tabs left')
  readonly nextLabel = input('Scroll tabs right')

  readonly scrollPresent = signal(false)
  readonly canScrollBackward = signal(false)
  readonly canScrollForward = signal(false)
  readonly showArrow = computed(() => this.zShowArrow() && this.scrollPresent())

  ngAfterViewInit(): void {
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        this.syncScrollState()

        const container = this.container().nativeElement
        const viewport = this.viewport().nativeElement
        const content = this.content().nativeElement
        const ResizeObserverConstructor = this.window?.ResizeObserver
        const MutationObserverConstructor = this.window?.MutationObserver

        if (ResizeObserverConstructor) {
          const resizeObserver = new ResizeObserverConstructor(() => this.syncScrollState())
          resizeObserver.observe(container)
          resizeObserver.observe(viewport)
          resizeObserver.observe(content)
          this.destroyRef.onDestroy(() => resizeObserver.disconnect())
        }

        if (MutationObserverConstructor) {
          const mutationObserver = new MutationObserverConstructor(() => this.syncScrollState())
          mutationObserver.observe(content, {
            childList: true,
            subtree: true,
            characterData: true
          })
          this.destroyRef.onDestroy(() => mutationObserver.disconnect())
        }
      })
    })
  }

  scrollNav(direction: 'backward' | 'forward'): void {
    const viewport = this.viewport().nativeElement
    const delta = direction === 'backward' ? -this.zScrollAmount() : this.zScrollAmount()
    viewport.scrollBy({ left: delta, behavior: 'smooth' })
  }

  syncScrollState(): void {
    const container = this.container()?.nativeElement
    const viewport = this.viewport()?.nativeElement
    if (!container || !viewport || !this.zShowArrow()) {
      this.scrollPresent.set(false)
      this.canScrollBackward.set(false)
      this.canScrollForward.set(false)
      return
    }

    const maxScrollLeft = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
    const scrollLeft = Math.max(0, viewport.scrollLeft)
    const hasOverflow = viewport.scrollWidth > container.clientWidth + 1

    this.scrollPresent.set(hasOverflow)
    this.canScrollBackward.set(hasOverflow && scrollLeft > 1)
    this.canScrollForward.set(hasOverflow && scrollLeft < maxScrollLeft - 1)
  }
}
