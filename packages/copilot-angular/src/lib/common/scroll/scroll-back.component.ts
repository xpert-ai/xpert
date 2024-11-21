import { Direction, Directionality } from '@angular/cdk/bidi'
import { Platform, normalizePassiveListenerOptions } from '@angular/cdk/platform'
import { CommonModule, DOCUMENT } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  EventEmitter,
  Inject,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Optional,
  Output,
  SimpleChanges,
  TemplateRef,
  ViewEncapsulation,
  inject,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { Subject, fromEvent } from 'rxjs'
import { debounceTime, takeUntil } from 'rxjs/operators'
import { NzScrollService } from './scroll'

const passiveEventListenerOptions = normalizePassiveListenerOptions({ passive: true })

@Component({
  standalone: true,
  imports: [CommonModule],
  selector: 'copilot-scroll-back',
  exportAs: 'copilotScrollBack',
  template: `@if (visible()) {
    <div #backTop class="ngm-scroll-back block" [class.ngm-scroll-back-rtl]="dir === 'rtl'">
      <ng-template #defaultContent>
        <button
          class="cursor-pointer bottom-0 right-1/2 z-10 rounded-full bg-clip-padding border border-solid
      text-gray-600 bg-white dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200 border-black/10"
          (click)="scrollTo()"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" class="m-1 text-black dark:text-white" [class.rotate-180]="direction === 'top'">
            <path
              d="M17 13L12 18L7 13M12 6L12 17"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            ></path>
          </svg>
        </button>
      </ng-template>
      <ng-template [ngTemplateOutlet]="nzTemplate || defaultContent"></ng-template>
    </div>
    }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  preserveWhitespaces: false,
  styles: [
    `
      :host {
        display: block;
      }
    `
  ]
})
export class NgmScrollBackComponent implements OnInit, OnDestroy, OnChanges {
  readonly #destroyRef = inject(DestroyRef)
  readonly #scrollSrv = inject(NzScrollService)

  private scrollListenerDestroy$ = new Subject<boolean>()
  private target: HTMLElement | null = null

  readonly visible = signal(false)
  dir: Direction = 'ltr'

  @Input() nzTemplate?: TemplateRef<void>
  @Input() visibilityHeight = 100
  @Input() direction: 'top' | 'bottom' = 'top'
  @Input() ngmTarget?: string | HTMLElement
  @Input() ngmDuration = 450
  @Output() readonly nzClick: EventEmitter<boolean> = new EventEmitter()

  constructor(
    @Inject(DOCUMENT) private doc: Document,
    private platform: Platform,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    @Optional() private directionality: Directionality
  ) {
    this.dir = this.directionality.value
  }

  ngOnInit(): void {
    this.registerScrollEvent()

    this.directionality.change?.pipe(takeUntilDestroyed(this.#destroyRef)).subscribe((direction: Direction) => {
      this.dir = direction
      this.cdr.detectChanges()
    })

    this.dir = this.directionality.value
  }

  private getTarget(): HTMLElement | Window {
    return this.target || window
  }

  private handleScroll(): void {
    if (this.direction === 'top') {
      if (this.visible() === this.#scrollSrv.getScroll(this.getTarget()) > this.visibilityHeight) {
        return;
      }
    } else {
      if (this.visible() === this.#scrollSrv.distanceToBottom(this.getTarget()) > this.visibilityHeight) {
        return
      }
    }
    
    this.visible.update((state) => !state)
  }

  private registerScrollEvent(): void {
    if (!this.platform.isBrowser) {
      return
    }
    this.scrollListenerDestroy$.next(true)
    this.handleScroll()
    this.zone.runOutsideAngular(() => {
      fromEvent(this.getTarget(), 'scroll', <AddEventListenerOptions>passiveEventListenerOptions)
        .pipe(debounceTime(50), takeUntil(this.scrollListenerDestroy$))
        .subscribe(() => this.handleScroll())
    })
  }

  scrollTo() {
    if (this.direction === 'top') {
      this.target.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      this.target.scrollTop = this.target.scrollHeight - this.target.clientHeight
    }
  }

  ngOnDestroy(): void {
    this.scrollListenerDestroy$.next(true)
    this.scrollListenerDestroy$.complete()
  }

  ngOnChanges({ngmTarget}: SimpleChanges): void {
    if (ngmTarget) {
      this.target = typeof this.ngmTarget === 'string' ? this.doc.querySelector(this.ngmTarget) : this.ngmTarget
      this.registerScrollEvent()
    }
  }
}
