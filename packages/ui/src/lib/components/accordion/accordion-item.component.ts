import { NgTemplateOutlet } from '@angular/common';
import {
  Directive,
  Input,
  booleanAttribute,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  contentChild,
  EventEmitter,
  inject,
  input,
  Output,
  signal,
  TemplateRef,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import type { ZardAccordionComponent } from '@/src/lib/components/accordion/accordion.component';
import {
  accordionContentVariants,
  accordionDescriptionVariants,
  accordionHeaderVariants,
  accordionItemVariants,
  accordionTitleVariants,
} from '@/src/lib/components/accordion/accordion.variants';
import { ZardIconComponent } from '@/src/lib/components/icon';
import { mergeClasses } from '@/shared/utils/merge-classes';

let accordionItemId = 0;

function booleanOrNullAttribute(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  return booleanAttribute(value);
}

@Component({
  selector: 'z-accordion-title',
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'accordion-title',
    '[class]': 'classes()',
  },
  exportAs: 'zAccordionTitle',
})
export class ZardAccordionTitleComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(accordionTitleVariants(), this.class()));
}

@Component({
  selector: 'z-accordion-description',
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'accordion-description',
    '[class]': 'classes()',
  },
  exportAs: 'zAccordionDescription',
})
export class ZardAccordionDescriptionComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(accordionDescriptionVariants(), this.class()));
}

@Component({
  selector: 'z-accordion-header',
  imports: [ZardIconComponent],
  template: `
    @if (showLeadingChevron()) {
      <z-icon
        data-slot="accordion-chevron"
        [zType]="iconType()"
        [class]="iconClasses()"
      />
    }

    <span data-slot="accordion-header-content" class="flex min-w-0 flex-1 items-center gap-4">
      <ng-content />
    </span>

    @if (showTrailingChevron()) {
      <z-icon
        data-slot="accordion-chevron"
        [zType]="iconType()"
        [class]="iconClasses()"
      />
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    role: 'button',
    '[attr.data-slot]': '"accordion-header"',
    '[attr.data-density]': 'item.effectiveDisplayDensity()',
    '[attr.data-state]': 'item.expanded ? "open" : "closed"',
    '[attr.aria-controls]': 'item.contentId()',
    '[attr.aria-disabled]': 'item.disabled() ? "true" : null',
    '[attr.aria-expanded]': 'item.expanded',
    '[attr.id]': 'item.triggerId()',
    '[attr.tabindex]': 'item.disabled() ? -1 : 0',
    '(click)': 'item.handleHeaderClick($event)',
    '(keydown)': 'item.handleHeaderKeydown($event)',
  },
  exportAs: 'zAccordionHeader',
})
export class ZardAccordionHeaderComponent {
  readonly class = input<ClassValue>('');
  protected readonly item = inject(ZardAccordionItemComponent);

  protected readonly classes = computed(() =>
    mergeClasses(
      accordionHeaderVariants({ density: (this.item.effectiveDisplayDensity() as 'compact' | 'cosy' | null) ?? 'default' }),
      this.class(),
    ),
  );

  protected readonly iconType = computed(() =>
    this.item.effectiveTogglePosition() === 'before' ? 'chevron-right' : 'chevron-down',
  );

  protected readonly iconClasses = computed(() =>
    mergeClasses(
      'text-muted-foreground pointer-events-none size-4 shrink-0 transition-transform duration-200',
      this.item.effectiveTogglePosition() === 'before'
        ? (this.item.expanded ? 'rotate-90' : '')
        : (this.item.expanded ? 'rotate-180' : ''),
    ),
  );

  protected readonly showLeadingChevron = computed(
    () => !this.item.effectiveHideToggle() && this.item.effectiveTogglePosition() === 'before',
  );

  protected readonly showTrailingChevron = computed(
    () => !this.item.effectiveHideToggle() && this.item.effectiveTogglePosition() !== 'before',
  );
}

@Directive({
  selector: 'ng-template[zAccordionContent]',
})
export class ZardAccordionContentDirective {
  constructor(readonly templateRef: TemplateRef<unknown>) {}
}

export interface ZardAccordionItemLike {
  readonly expanded: boolean;
  open(): void;
  close(): void;
  toggle(): void;
}

@Component({
  selector: 'z-accordion-item',
  imports: [NgTemplateOutlet, ZardAccordionHeaderComponent, ZardIconComponent],
  template: `
    @if (header()) {
      <ng-content select="z-accordion-header" />
    } @else {
      <div
        [class]="fallbackHeaderClasses()"
        role="button"
        [attr.aria-controls]="contentId()"
        [attr.aria-disabled]="disabled() ? 'true' : null"
        [attr.aria-expanded]="expanded"
        [attr.data-density]="effectiveDisplayDensity()"
        [attr.data-slot]="'accordion-header'"
        [attr.data-state]="expanded ? 'open' : 'closed'"
        [attr.id]="triggerId()"
        [attr.tabindex]="disabled() ? -1 : 0"
        (click)="handleHeaderClick($event)"
        (keydown)="handleHeaderKeydown($event)"
      >
        @if (!effectiveHideToggle() && effectiveTogglePosition() === 'before') {
          <z-icon
            data-slot="accordion-chevron"
            zType="chevron-right"
            class="text-muted-foreground pointer-events-none size-4 shrink-0 transition-transform duration-200"
            [class.rotate-90]="expanded"
          />
        }

        <span data-slot="accordion-header-content" class="flex min-w-0 flex-1 items-center gap-4">
          <span data-slot="accordion-title" class="min-w-0 flex-1 text-left">
            {{ zTitle() }}
          </span>
        </span>

        @if (!effectiveHideToggle() && effectiveTogglePosition() !== 'before') {
          <z-icon
            data-slot="accordion-chevron"
            zType="chevron-down"
            class="text-muted-foreground pointer-events-none size-4 shrink-0 transition-transform duration-200"
            [class.rotate-180]="expanded"
          />
        }
      </div>
    }

    <div
      role="region"
      [attr.aria-labelledby]="triggerId()"
      [attr.data-slot]="'accordion-region'"
      [attr.data-state]="expanded ? 'open' : 'closed'"
      [attr.id]="contentId()"
      [class]="contentClasses()"
    >
      <div data-slot="accordion-body" class="min-h-0 overflow-hidden">
        <div [class]="bodyClasses()">
          @if (lazyContent()) {
            @if (shouldRenderLazyContent()) {
              <ng-container [ngTemplateOutlet]="lazyContent()!.templateRef" />
            }
          } @else {
            <ng-content />
          }
        </div>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'accordion-item',
    '[class]': 'itemClasses()',
    '[attr.data-density]': 'effectiveDisplayDensity()',
    '[attr.data-display-mode]': 'accordion?.displayMode() ?? null',
    '[attr.data-disabled]': 'disabled() ? "true" : null',
    '[attr.data-state]': "expanded ? 'open' : 'closed'",
  },
  exportAs: 'zAccordionItem',
})
export class ZardAccordionItemComponent implements ZardAccordionItemLike {
  readonly zTitle = input<string>('');
  readonly zValue = input<string>('');
  readonly class = input<ClassValue>('');
  readonly displayDensity = input<string | null>(null);
  readonly togglePosition = input<'before' | 'after' | null>(null);

  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly expandedState = signal(false);
  private readonly disabledState = signal(false);
  private readonly hideToggleState = signal<boolean | null>(null);
  private readonly renderedLazyContent = signal(false);
  private readonly hasExpandedBinding = signal(false);
  private readonly id = `z-accordion-item-${++accordionItemId}`;

  readonly header = contentChild(ZardAccordionHeaderComponent);
  readonly lazyContent = contentChild(ZardAccordionContentDirective);

  accordion?: ZardAccordionComponent;

  @Output()
  readonly opened = new EventEmitter<void>();

  @Output()
  readonly closed = new EventEmitter<void>();

  @Output()
  readonly expandedChange = new EventEmitter<boolean>();

  @Input({ alias: 'expanded', transform: booleanAttribute })
  set expandedInput(value: boolean) {
    this.hasExpandedBinding.set(true);
    this.setExpandedState(value, { emit: true });
  }

  @Input({ alias: 'disabled', transform: booleanAttribute })
  set disabledInput(value: boolean) {
    this.disabledState.set(value);
    this.markForUpdate();
  }

  @Input({ alias: 'hideToggle', transform: booleanOrNullAttribute })
  set hideToggleInput(value: boolean | null) {
    this.hideToggleState.set(value);
    this.markForUpdate();
  }

  readonly itemClasses = computed(() => mergeClasses(accordionItemVariants(), this.class()));
  readonly contentClasses = computed(() => mergeClasses(accordionContentVariants({ isOpen: this.expanded })));
  readonly bodyClasses = computed(() =>
    mergeClasses(this.effectiveDisplayDensity() === 'compact' ? 'px-4 pb-3' : 'px-4 pb-4'),
  );
  readonly fallbackHeaderClasses = computed(() =>
    mergeClasses(
      accordionHeaderVariants({ density: (this.effectiveDisplayDensity() as 'compact' | 'cosy' | null) ?? 'default' }),
    ),
  );

  get expanded(): boolean {
    return this.expandedState();
  }

  value(): string {
    return this.zValue() || this.id;
  }

  triggerId(): string {
    return `${this.value()}-trigger`;
  }

  contentId(): string {
    return `${this.value()}-content`;
  }

  hasExpandedInput(): boolean {
    return this.hasExpandedBinding();
  }

  disabled(): boolean {
    return this.disabledState();
  }

  effectiveHideToggle(): boolean {
    return this.hideToggleState() ?? this.accordion?.hideToggle() ?? false;
  }

  effectiveTogglePosition(): 'before' | 'after' {
    return this.togglePosition() ?? this.accordion?.togglePosition() ?? 'after';
  }

  effectiveDisplayDensity(): string | null {
    return this.displayDensity() ?? this.accordion?.displayDensity() ?? null;
  }

  shouldRenderLazyContent(): boolean {
    return this.renderedLazyContent() || this.expanded;
  }

  open(): void {
    if (this.accordion) {
      this.accordion.openItem(this);
      return;
    }

    this.setExpandedState(true, { emit: true });
  }

  close(): void {
    if (this.accordion) {
      this.accordion.closeItem(this);
      return;
    }

    this.setExpandedState(false, { emit: true });
  }

  toggle(): void {
    if (this.accordion) {
      this.accordion.toggleItem(this);
      return;
    }

    this.setExpandedState(!this.expanded, { emit: true });
  }

  handleHeaderClick(event: Event): void {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    this.toggle();
  }

  handleHeaderKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }

    event.preventDefault();
    if (this.disabled()) {
      return;
    }

    this.toggle();
  }

  setExpandedState(expanded: boolean, options: { emit?: boolean } = {}): void {
    const previous = this.expanded;
    if (previous === expanded) {
      return;
    }

    this.expandedState.set(expanded);
    if (expanded) {
      this.renderedLazyContent.set(true);
    }

    if (options.emit !== false) {
      this.expandedChange.emit(expanded);
      if (expanded) {
        this.opened.emit();
      } else {
        this.closed.emit();
      }
    }

    this.markForUpdate();
  }

  private markForUpdate(): void {
    this.changeDetectorRef.markForCheck();
  }
}
