import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  effect,
  HostListener,
  inject,
  input,
  numberAttribute,
  output,
  type TemplateRef,
  viewChild,
  ViewEncapsulation,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

import type { ClassValue } from 'clsx';

import { ZardButtonComponent } from '../button/button.component';
import { ZardStringTemplateOutletDirective } from '../../core/directives/string-template-outlet/string-template-outlet.directive';
import { mergeClasses } from '../../utils/merge-classes';

import {
  highlightActionsVariants,
  highlightCardVariants,
  highlightCloseVariants,
  highlightDescriptionVariants,
  highlightFooterVariants,
  highlightIndicatorVariants,
  highlightMaskVariants,
  highlightOverlayVariants,
  highlightTargetBlockerVariants,
  highlightTargetVariants,
  highlightTitleVariants,
} from './highlight.variants';
import type {
  ZardHighlightActionsContext,
  ZardHighlightGap,
  ZardHighlightIndicatorContext,
  ZardHighlightPlacement,
  ZardHighlightStep,
  ZardHighlightTarget,
  ZardHighlightType,
} from './highlight.types';

const DEFAULT_GAP: Required<ZardHighlightGap> = {
  offset: 6,
  radius: 2,
};
const DEFAULT_CARD_WIDTH = 320;
const DEFAULT_CARD_HEIGHT = 160;
const VIEWPORT_MARGIN = 16;
const CARD_TARGET_GAP = 12;

interface ZardHighlightRect {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

interface ZardHighlightBoxStyle {
  top: string;
  left: string;
  width: string;
  height: string;
  borderRadius?: string;
}

interface ZardHighlightMaskSegment extends ZardHighlightBoxStyle {
  id: string;
}

interface ZardHighlightViewport {
  width: number;
  height: number;
}

@Component({
  selector: 'z-highlight',
  imports: [NgIcon, NgTemplateOutlet, ZardButtonComponent, ZardStringTemplateOutletDirective],
  template: `
    @if (shouldRender()) {
      <div [class]="overlayClasses()" data-slot="highlight-overlay">
        @if (maskEnabled()) {
          @for (segment of maskSegments(); track segment.id) {
            <div
              [class]="maskClasses()"
              [style.top]="segment.top"
              [style.left]="segment.left"
              [style.width]="segment.width"
              [style.height]="segment.height"
              [style.border-radius]="segment.borderRadius"
              data-slot="highlight-mask"
            ></div>
          }
        }

        @if (targetRect(); as target) {
          <div
            [class]="targetClasses()"
            [style.top.px]="target.top"
            [style.left.px]="target.left"
            [style.width.px]="target.width"
            [style.height.px]="target.height"
            [style.border-radius.px]="target.radius"
            data-slot="highlight-target"
          ></div>

          @if (targetInteractionDisabled()) {
            <div
              [class]="targetBlockerClasses()"
              [style.top.px]="target.top"
              [style.left.px]="target.left"
              [style.width.px]="target.width"
              [style.height.px]="target.height"
              [style.border-radius.px]="target.radius"
              data-slot="highlight-target-blocker"
            ></div>
          }
        }

        @if (currentStep(); as step) {
          <div
            #card
            [class]="cardClasses()"
            [style.top]="cardStyle().top"
            [style.left]="cardStyle().left"
            [style.transform]="cardStyle().transform"
            data-slot="highlight-card"
          >
            <button
              z-button
              zType="ghost"
              zSize="icon-sm"
              type="button"
              [class]="closeClasses()"
              [attr.aria-label]="zCloseText()"
              data-slot="highlight-close"
              (click)="close()"
            >
              <ng-icon name="lucideX" />
            </button>

            @if (step.title) {
              <div [class]="titleClasses()" data-slot="highlight-title">
                <ng-container *zStringTemplateOutlet="step.title">{{ step.title }}</ng-container>
              </div>
            }

            @if (step.description) {
              <div [class]="descriptionClasses()" data-slot="highlight-description">
                <ng-container *zStringTemplateOutlet="step.description">{{ step.description }}</ng-container>
              </div>
            }

            <div [class]="footerClasses()" data-slot="highlight-footer">
              @if (zIndicator(); as indicatorTemplate) {
                <div [class]="indicatorClasses()" data-slot="highlight-indicator">
                  <ng-container
                    *ngTemplateOutlet="indicatorTemplate; context: indicatorContext()"
                  ></ng-container>
                </div>
              } @else {
                <div [class]="indicatorClasses()" data-slot="highlight-indicator">
                  {{ currentIndex() + 1 }} / {{ totalSteps() }}
                </div>
              }

              @if (zActions(); as actionsTemplate) {
                <div [class]="actionsClasses()" data-slot="highlight-actions">
                  <ng-container *ngTemplateOutlet="actionsTemplate; context: actionsContext()"></ng-container>
                </div>
              } @else {
                <div [class]="actionsClasses()" data-slot="highlight-actions">
                  @if (!isFirstStep()) {
                    <button z-button zType="secondary" zSize="sm" type="button" data-slot="highlight-prev" (click)="prev()">
                      {{ zPrevText() }}
                    </button>
                  }

                  @if (isLastStep()) {
                    <button z-button zSize="sm" type="button" data-slot="highlight-finish" (click)="finish()">
                      {{ zFinishText() }}
                    </button>
                  } @else {
                    <button z-button zSize="sm" type="button" data-slot="highlight-next" (click)="next()">
                      {{ zNextText() }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  viewProviders: [provideIcons({ lucideX })],
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-slot]': '"highlight"',
  },
  exportAs: 'zHighlight',
})
export class ZardHighlightComponent {
  private readonly destroyRef = inject(DestroyRef);
  private readonly cardElement = viewChild<ElementRef<HTMLElement>>('card');
  private readonly viewportVersion = signal(0);
  private targetRevealFrame: number | null = null;

  readonly class = input<ClassValue>('');
  readonly zOpen = input(false, { transform: booleanAttribute });
  readonly zCurrent = input(0, { transform: numberAttribute });
  readonly zSteps = input<ZardHighlightStep[]>([]);
  readonly zPlacement = input<ZardHighlightPlacement>('bottom');
  readonly zMask = input(true, { transform: booleanAttribute });
  readonly zGap = input<ZardHighlightGap>(DEFAULT_GAP);
  readonly zDisabledInteraction = input(false, { transform: booleanAttribute });
  readonly zKeyboard = input(true, { transform: booleanAttribute });
  readonly zType = input<ZardHighlightType>('default');
  readonly zPrevText = input('上一步');
  readonly zNextText = input('下一步');
  readonly zFinishText = input('完成');
  readonly zCloseText = input('关闭');
  readonly zActions = input<TemplateRef<ZardHighlightActionsContext>>();
  readonly zIndicator = input<TemplateRef<ZardHighlightIndicatorContext>>();

  readonly zOpenChange = output<boolean>();
  readonly zCurrentChange = output<number>();
  readonly zChange = output<number>();
  readonly zClose = output<void>();
  readonly zFinish = output<void>();

  protected readonly totalSteps = computed(() => this.zSteps().length);
  protected readonly shouldRender = computed(() => this.zOpen() && this.totalSteps() > 0);
  protected readonly currentIndex = computed(() => clamp(this.zCurrent(), 0, Math.max(this.totalSteps() - 1, 0)));
  protected readonly currentStep = computed(() => this.zSteps()[this.currentIndex()] ?? null);
  protected readonly placement = computed(() => this.currentStep()?.placement ?? this.zPlacement());
  protected readonly cardPlacement = computed<ZardHighlightPlacement>(() =>
    this.targetRect() ? this.placement() : 'center',
  );
  protected readonly type = computed(() => this.currentStep()?.type ?? this.zType());
  protected readonly gap = computed(() => ({ ...DEFAULT_GAP, ...this.zGap(), ...this.currentStep()?.gap }));
  protected readonly maskEnabled = computed(() => this.currentStep()?.mask ?? this.zMask());
  protected readonly isFirstStep = computed(() => this.currentIndex() === 0);
  protected readonly isLastStep = computed(() => this.currentIndex() >= this.totalSteps() - 1);
  protected readonly targetRect = computed(() => {
    this.viewportVersion();

    const step = this.currentStep();
    const element = resolveTarget(step?.target);
    if (!element) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    const gap = this.gap();
    const offset = gap.offset ?? DEFAULT_GAP.offset;
    const offsetX = Array.isArray(offset) ? offset[0] : offset;
    const offsetY = Array.isArray(offset) ? offset[1] : offset;
    const left = Math.max(0, rect.left - offsetX);
    const top = Math.max(0, rect.top - offsetY);
    const width = Math.max(0, rect.width + offsetX * 2);
    const height = Math.max(0, rect.height + offsetY * 2);

    return {
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height,
      radius: gap.radius ?? DEFAULT_GAP.radius,
    };
  });
  protected readonly targetInteractionDisabled = computed(() => this.zDisabledInteraction() && this.targetRect() !== null);
  protected readonly maskSegments = computed(() => {
    const target = this.targetRect();
    const viewport = getViewport();

    if (!target || this.targetInteractionDisabled()) {
      return [
        createMaskSegment('full', {
          top: 0,
          left: 0,
          width: viewport.width,
          height: viewport.height,
        }),
      ];
    }

    return [
      createMaskSegment('top', {
        top: 0,
        left: 0,
        width: viewport.width,
        height: target.top,
      }),
      createMaskSegment('bottom', {
        top: target.bottom,
        left: 0,
        width: viewport.width,
        height: Math.max(0, viewport.height - target.bottom),
      }),
      createMaskSegment('left', {
        top: target.top,
        left: 0,
        width: target.left,
        height: target.height,
      }),
      createMaskSegment('right', {
        top: target.top,
        left: target.right,
        width: Math.max(0, viewport.width - target.right),
        height: target.height,
      }),
    ];
  });
  protected readonly cardStyle = computed(() => {
    this.viewportVersion();

    const target = this.targetRect();
    const placement = this.placement();
    const viewport = getViewport();
    const cardRect = this.cardElement()?.nativeElement.getBoundingClientRect();
    const cardWidth = cardRect && cardRect.width > 0 ? cardRect.width : DEFAULT_CARD_WIDTH;
    const cardHeight = cardRect && cardRect.height > 0 ? cardRect.height : DEFAULT_CARD_HEIGHT;

    if (!target || placement === 'center') {
      return {
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      };
    }

    const point = getCardPoint(placement, target, cardWidth, cardHeight);
    const left = clamp(point.left, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.width - cardWidth - VIEWPORT_MARGIN));
    const top = clamp(point.top, VIEWPORT_MARGIN, Math.max(VIEWPORT_MARGIN, viewport.height - cardHeight - VIEWPORT_MARGIN));

    return {
      top: `${top}px`,
      left: `${left}px`,
      transform: undefined,
    };
  });
  protected readonly actionsContext = computed<ZardHighlightActionsContext>(() => ({
    current: this.currentIndex(),
    total: this.totalSteps(),
    step: this.currentStep(),
    isFirst: this.isFirstStep(),
    isLast: this.isLastStep(),
    prev: () => this.prev(),
    next: () => this.next(),
    close: () => this.close(),
    finish: () => this.finish(),
  }));
  protected readonly indicatorContext = computed<ZardHighlightIndicatorContext>(() => ({
    current: this.currentIndex(),
    total: this.totalSteps(),
    step: this.currentStep(),
  }));

  protected readonly hostClasses = computed(() => mergeClasses(this.class()));
  protected readonly overlayClasses = computed(() => highlightOverlayVariants());
  protected readonly maskClasses = computed(() => highlightMaskVariants());
  protected readonly targetClasses = computed(() => highlightTargetVariants());
  protected readonly targetBlockerClasses = computed(() => highlightTargetBlockerVariants());
  protected readonly cardClasses = computed(() =>
    highlightCardVariants({
      placement: this.cardPlacement(),
      zType: this.type(),
    }),
  );
  protected readonly closeClasses = computed(() => highlightCloseVariants());
  protected readonly titleClasses = computed(() => highlightTitleVariants());
  protected readonly descriptionClasses = computed(() => highlightDescriptionVariants());
  protected readonly footerClasses = computed(() => highlightFooterVariants());
  protected readonly actionsClasses = computed(() => highlightActionsVariants());
  protected readonly indicatorClasses = computed(() => highlightIndicatorVariants());

  constructor() {
    effect(() => {
      if (!this.shouldRender()) {
        return;
      }

      this.currentStep();
      this.queueTargetReveal();
    });

    this.destroyRef.onDestroy(() => this.cancelTargetReveal());

    afterNextRender(() => {
      this.revealCurrentTarget();
      this.refreshPosition();
      this.observeDocumentScroll();
    });
  }

  @HostListener('window:resize')
  @HostListener('window:scroll')
  protected refreshPosition(): void {
    this.viewportVersion.update(version => version + 1);
  }

  @HostListener('document:keydown', ['$event'])
  protected handleKeydown(event: KeyboardEvent): void {
    if (!this.shouldRender() || !this.zKeyboard()) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.next();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.prev();
    }
  }

  protected prev(): void {
    if (this.isFirstStep()) {
      return;
    }

    this.setCurrent(this.currentIndex() - 1);
  }

  protected next(): void {
    if (this.isLastStep()) {
      this.finish();
      return;
    }

    this.setCurrent(this.currentIndex() + 1);
  }

  protected close(): void {
    this.zClose.emit();
    this.zOpenChange.emit(false);
  }

  protected finish(): void {
    this.zFinish.emit();
    this.zOpenChange.emit(false);
  }

  private setCurrent(nextCurrent: number): void {
    const clamped = clamp(nextCurrent, 0, Math.max(this.totalSteps() - 1, 0));
    if (clamped === this.currentIndex()) {
      return;
    }

    this.zCurrentChange.emit(clamped);
    this.zChange.emit(clamped);
    this.refreshPosition();
  }

  private observeDocumentScroll(): void {
    if (typeof document === 'undefined') {
      return;
    }

    const refresh = () => this.refreshPosition();
    document.addEventListener('scroll', refresh, true);
    this.destroyRef.onDestroy(() => {
      document.removeEventListener('scroll', refresh, true);
    });
  }

  private queueTargetReveal(): void {
    if (typeof window === 'undefined') {
      return;
    }

    if (this.targetRevealFrame !== null) {
      window.cancelAnimationFrame(this.targetRevealFrame);
    }

    this.targetRevealFrame = window.requestAnimationFrame(() => {
      this.targetRevealFrame = null;
      this.revealCurrentTarget();
    });
  }

  private revealCurrentTarget(): void {
    const element = resolveTarget(this.currentStep()?.target);

    if (element?.isConnected && typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({
        behavior: 'auto',
        block: 'center',
        inline: 'nearest',
      });
    }

    this.refreshPosition();
  }

  private cancelTargetReveal(): void {
    if (typeof window === 'undefined' || this.targetRevealFrame === null) {
      return;
    }

    window.cancelAnimationFrame(this.targetRevealFrame);
    this.targetRevealFrame = null;
  }
}

function resolveTarget(target: ZardHighlightTarget): HTMLElement | null {
  const value = typeof target === 'function' ? target() : target;
  if (!value) {
    return null;
  }

  if ('nativeElement' in value) {
    return value.nativeElement;
  }

  return value;
}

function getViewport(): ZardHighlightViewport {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0 };
  }

  return {
    width: window.innerWidth || document.documentElement.clientWidth || 0,
    height: window.innerHeight || document.documentElement.clientHeight || 0,
  };
}

function createMaskSegment(id: string, rect: Omit<ZardHighlightRect, 'right' | 'bottom' | 'radius'>): ZardHighlightMaskSegment {
  return {
    id,
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  };
}

function getCardPoint(
  placement: ZardHighlightPlacement,
  target: ZardHighlightRect,
  cardWidth: number,
  cardHeight: number,
): { top: number; left: number } {
  const centerLeft = target.left + target.width / 2 - cardWidth / 2;
  const centerTop = target.top + target.height / 2 - cardHeight / 2;

  switch (placement) {
    case 'top':
      return { top: target.top - cardHeight - CARD_TARGET_GAP, left: centerLeft };
    case 'topLeft':
      return { top: target.top - cardHeight - CARD_TARGET_GAP, left: target.left };
    case 'topRight':
      return { top: target.top - cardHeight - CARD_TARGET_GAP, left: target.right - cardWidth };
    case 'bottom':
      return { top: target.bottom + CARD_TARGET_GAP, left: centerLeft };
    case 'bottomLeft':
      return { top: target.bottom + CARD_TARGET_GAP, left: target.left };
    case 'bottomRight':
      return { top: target.bottom + CARD_TARGET_GAP, left: target.right - cardWidth };
    case 'left':
      return { top: centerTop, left: target.left - cardWidth - CARD_TARGET_GAP };
    case 'leftTop':
      return { top: target.top, left: target.left - cardWidth - CARD_TARGET_GAP };
    case 'leftBottom':
      return { top: target.bottom - cardHeight, left: target.left - cardWidth - CARD_TARGET_GAP };
    case 'right':
      return { top: centerTop, left: target.right + CARD_TARGET_GAP };
    case 'rightTop':
      return { top: target.top, left: target.right + CARD_TARGET_GAP };
    case 'rightBottom':
      return { top: target.bottom - cardHeight, left: target.right + CARD_TARGET_GAP };
    case 'center':
      return { top: centerTop, left: centerLeft };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
