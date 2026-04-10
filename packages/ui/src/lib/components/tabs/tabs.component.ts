import { NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  type AfterContentInit,
  type AfterViewInit,
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  contentChildren,
  DestroyRef,
  Directive,
  DOCUMENT,
  effect,
  ElementRef,
  EventEmitter,
  inject,
  InjectionToken,
  Injector,
  Input,
  input,
  Output,
  runInInjectionContext,
  signal,
  TemplateRef,
  untracked,
  viewChild,
  viewChildren,
  ViewEncapsulation,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';

import type { ClassValue } from 'clsx';
import { debounceTime, distinctUntilChanged, fromEvent, map, merge } from 'rxjs';

import { mergeClasses } from '../../utils/merge-classes';
import { ZardIconComponent } from '../icon/icon.component';
import {
  tabButtonVariants,
  tabNavBarVariants,
  tabContainerVariants,
  tabNavVariants,
  type ZardTabSizeVariants,
  type ZardTabVariants,
} from './tabs.variants';

export type zPosition = 'top' | 'bottom' | 'left' | 'right';
export type zAlign = 'center' | 'start' | 'end';
export type ZardTabHeaderPosition = 'above' | 'below';

export interface ZardTabChangeEvent {
  index: number;
  label: string;
  tab: ZardTabComponent;
}

const ZARD_TAB_NAV_BAR = new InjectionToken<ZardTabNavBarDirective>('ZARD_TAB_NAV_BAR');
let zardTabNavPanelId = 0;

@Directive({
  selector: 'ng-template[zTabLabel]',
})
export class ZardTabLabelDirective {
  constructor(readonly templateRef: TemplateRef<unknown>) {}
}

@Directive({
  selector: 'ng-template[zTabContent]',
})
export class ZardTabContentDirective {
  constructor(readonly templateRef: TemplateRef<unknown>) {}
}

@Component({
  selector: 'z-tab-nav-panel',
  template: `<ng-content />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'class': 'z-tab-nav-panel block min-h-0 min-w-0',
    'role': 'tabpanel',
    '[attr.id]': 'panelId',
  },
})
export class ZardTabNavPanelComponent {
  readonly panelId = `z-tab-nav-panel-${++zardTabNavPanelId}`;
}

@Directive({
  selector: '[z-tab-link]',
  host: {
    '[class]': 'classes()',
    'role': 'tab',
    '[attr.aria-selected]': 'active()',
    '[attr.aria-controls]': 'panelId()',
    '[attr.aria-disabled]': 'disabled() ? "true" : null',
    '[attr.tabindex]': 'tabIndex()',
    '[attr.data-active]': 'active() ? "true" : null',
    '[attr.data-disabled]': 'disabled() ? "true" : null',
    '(click)': 'onClick($event)',
    '(keydown)': 'onKeydown($event)',
  },
})
export class ZardTabNavLinkDirective {
  readonly active = input(false, { transform: booleanAttribute });
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly class = input<ClassValue>('');

  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly navBar = inject(ZARD_TAB_NAV_BAR, { optional: true });

  readonly panelId = computed(() => this.navBar?.panelId() ?? null);
  readonly stretchTabs = computed(() => this.navBar?.stretchTabs() ?? false);
  readonly classes = computed(() =>
    mergeClasses(
      'z-tab-link',
      tabButtonVariants({
        zActivePosition: this.navBar?.effectiveHeaderPosition() === 'below' ? 'top' : 'bottom',
        zSize: this.navBar?.effectiveZSize() ?? 'default',
        isActive: this.active(),
        isDisabled: this.disabled(),
        stretchTabs: this.stretchTabs(),
      }),
      this.class(),
    ),
  );
  readonly tabIndex = computed(() => {
    if (this.disabled()) {
      return -1;
    }

    if (this.active()) {
      return 0;
    }

    return this.navBar && !this.navBar.hasActiveLink() && this.navBar.isFirstEnabled(this) ? 0 : -1;
  });

  focus(): void {
    this.elementRef.nativeElement.focus();
  }

  onClick(event: Event): void {
    if (this.disabled()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!this.disabled()) {
        this.elementRef.nativeElement.click();
      }
      return;
    }

    if (!this.navBar) {
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      this.navBar.focusEdge(1);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      this.navBar.focusEdge(-1);
      return;
    }

    const delta = getNavigationDelta(event.key, true);
    if (delta === null) {
      return;
    }

    event.preventDefault();
    this.navBar.focusRelative(this, delta);
  }
}

@Directive({
  selector: 'nav[z-tab-nav-bar]',
  exportAs: 'zTabNavBar',
  providers: [
    {
      provide: ZARD_TAB_NAV_BAR,
      useExisting: ZardTabNavBarDirective,
    },
  ],
  host: {
    '[class]': 'classes()',
    'role': 'tablist',
    '[attr.aria-orientation]': '"horizontal"',
    '[attr.data-header-position]': 'effectiveHeaderPosition()',
    '[attr.data-z-size]': 'effectiveZSize()',
    '[attr.data-tab-align]': 'stretchTabs() ? null : alignTabs()',
    '[attr.data-stretch-tabs]': 'stretchTabs() ? "true" : null',
  },
})
export class ZardTabNavBarDirective {
  readonly class = input<ClassValue>('');
  readonly tabPanel = input<ZardTabNavPanelComponent | null>(null);
  readonly alignTabs = input<zAlign>('start');
  readonly stretchTabs = input(false, { transform: booleanAttribute });
  readonly headerPosition = input<ZardTabHeaderPosition | null>(null);
  readonly disableRipple = input(false, { transform: booleanAttribute });
  readonly color = input<string | null>(null);
  readonly zSize = input<ZardTabSizeVariants | null>(null);
  readonly legacyDisplayDensity = input<string | null>(null, { alias: 'displayDensity' });

  private readonly linkDirectives = contentChildren(ZardTabNavLinkDirective, { descendants: true });

  readonly effectiveHeaderPosition = computed<ZardTabHeaderPosition>(() => this.headerPosition() ?? 'above');
  readonly effectiveZSize = computed<ZardTabSizeVariants>(
    () => this.zSize() ?? displayDensityToTabSize(this.legacyDisplayDensity()) ?? 'default',
  );
  readonly classes = computed(() =>
    mergeClasses(
      tabNavBarVariants({
        headerPosition: this.effectiveHeaderPosition(),
        zAlignTabs: this.stretchTabs() ? null : this.alignTabs(),
        zSize: this.effectiveZSize(),
      }),
      this.class(),
    ),
  );

  panelId(): string | null {
    return this.tabPanel()?.panelId ?? null;
  }

  hasActiveLink(): boolean {
    return this.linkDirectives().some(link => link.active() && !link.disabled());
  }

  isFirstEnabled(link: ZardTabNavLinkDirective): boolean {
    return this.firstEnabledLink() === link;
  }

  focusRelative(current: ZardTabNavLinkDirective, delta: number): void {
    const links = this.linkDirectives();
    const currentIndex = links.indexOf(current);
    if (currentIndex === -1) {
      this.focusEdge(delta >= 0 ? 1 : -1);
      return;
    }

    let index = currentIndex + delta;
    while (index >= 0 && index < links.length) {
      if (!links[index].disabled()) {
        links[index].focus();
        return;
      }
      index += delta;
    }
  }

  focusEdge(direction: 1 | -1): void {
    const links = this.linkDirectives();
    if (!links.length) {
      return;
    }

    const orderedLinks = direction === 1 ? links : [...links].reverse();
    orderedLinks.find(link => !link.disabled())?.focus();
  }

  private firstEnabledLink(): ZardTabNavLinkDirective | undefined {
    return this.linkDirectives().find(link => !link.disabled());
  }
}

@Component({
  selector: 'z-tab',
  imports: [],
  template: `
    <ng-template #defaultContent>
      <ng-content />
    </ng-template>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
})
export class ZardTabComponent {
  readonly label = input<string>();
  readonly disabled = input(false, { transform: booleanAttribute });
  readonly bodyClass = input<string>('');

  private readonly defaultContent = viewChild.required<TemplateRef<unknown>>('defaultContent');
  private readonly labelDirective = contentChild(ZardTabLabelDirective);
  private readonly contentDirective = contentChild(ZardTabContentDirective);

  readonly labelTemplate = computed(() => this.labelDirective()?.templateRef ?? null);
  readonly contentTemplate = computed(
    () => this.contentDirective()?.templateRef ?? this.defaultContent(),
  );
}

@Component({
  selector: 'z-tab-group',
  exportAs: 'zTabGroup',
  imports: [NgTemplateOutlet, ZardIconComponent],
  template: `
    @if (navBeforeContent()) {
      <ng-container [ngTemplateOutlet]="navigationBlock" />
    }

    <div class="z-tab-group__content flex-1 min-h-0">
      @for (tab of tabs(); track $index; let index = $index) {
        @if (shouldRenderTab(index)) {
          <div
            role="tabpanel"
            class="z-tab-group__panel focus-visible:ring-primary/50 outline-none focus-visible:ring-2"
            [class]="panelClasses()[index]"
            [attr.id]="'tabpanel-' + index"
            [attr.aria-labelledby]="'tab-' + index"
            [attr.tabindex]="isActive(index) ? 0 : -1"
            [attr.data-active]="isActive(index) ? 'true' : null"
            [hidden]="!isActive(index)"
          >
            <ng-container [ngTemplateOutlet]="tab.contentTemplate()" />
          </div>
        }
      }
    </div>

    @if (!navBeforeContent()) {
      <ng-container [ngTemplateOutlet]="navigationBlock" />
    }

    <ng-template #navigationBlock>
      @let horizontal = isHorizontal();

      <div [class]="navGridClasses()">
        @if (showArrow()) {
          @if (horizontal) {
            <button
              type="button"
              class="z-tab-group__scroll-btn z-tab-group__scroll-btn--left cursor-pointer pr-4"
              [class.mb-4]="effectiveTabsPosition() === 'top'"
              [class.mt-4]="effectiveTabsPosition() === 'bottom'"
              (click)="scrollNav('left')"
            >
              <z-icon zType="chevron-left" />
            </button>
          } @else {
            <button
              type="button"
              class="z-tab-group__scroll-btn z-tab-group__scroll-btn--up cursor-pointer pb-4"
              [class.mr-4]="effectiveTabsPosition() === 'left'"
              [class.ml-4]="effectiveTabsPosition() === 'right'"
              (click)="scrollNav('up')"
            >
              <z-icon zType="chevron-up" />
            </button>
          }
        }

        <nav
          #tabNav
          role="tablist"
          [class]="navClasses()"
          [attr.aria-orientation]="horizontal ? 'horizontal' : 'vertical'"
          [attr.data-tab-align]="effectiveAlignTabs()"
        >
          @for (tab of tabs(); track $index; let index = $index) {
            <div
              #tabTrigger
              role="tab"
              [class]="buttonClassesSignal()[index]"
              [attr.id]="'tab-' + index"
              [attr.aria-controls]="'tabpanel-' + index"
              [attr.aria-disabled]="tab.disabled() ? 'true' : null"
              [attr.aria-selected]="isActive(index)"
              [attr.tabindex]="isActive(index) ? 0 : -1"
              [attr.data-active]="isActive(index) ? 'true' : null"
              [attr.data-disabled]="tab.disabled() ? 'true' : null"
              (click)="onTabInteraction(index)"
              (keydown)="onTriggerKeydown($event, index)"
            >
              @if (tab.labelTemplate(); as labelTemplate) {
                <ng-container [ngTemplateOutlet]="labelTemplate" />
              } @else {
                {{ tab.label() }}
              }
            </div>
          }
        </nav>

        @if (showArrow()) {
          @if (horizontal) {
            <button
              type="button"
              class="z-tab-group__scroll-btn z-tab-group__scroll-btn--right cursor-pointer pl-4"
              [class.mb-4]="effectiveTabsPosition() === 'top'"
              [class.mt-4]="effectiveTabsPosition() === 'bottom'"
              (click)="scrollNav('right')"
            >
              <z-icon zType="chevron-right" />
            </button>
          } @else {
            <button
              type="button"
              class="z-tab-group__scroll-btn z-tab-group__scroll-btn--down cursor-pointer pt-4"
              [class.mr-4]="effectiveTabsPosition() === 'left'"
              [class.ml-4]="effectiveTabsPosition() === 'right'"
              (click)="scrollNav('down')"
            >
              <z-icon zType="chevron-down" />
            </button>
          }
        }
      </div>
    </ng-template>
  `,
  styles: `
    .nav-tab-scroll {
      -webkit-overflow-scrolling: touch;
      scroll-behavior: smooth;
      scrollbar-width: thin;
    }

    .nav-tab-scroll::-webkit-scrollbar-thumb {
      background-color: rgba(209, 209, 209, 0.2);
      border-radius: 2px;
    }

    .nav-tab-scroll::-webkit-scrollbar {
      height: 4px;
      width: 4px;
    }

    .nav-tab-scroll::-webkit-scrollbar-button {
      display: none;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'containerClasses()',
    '[attr.data-header-position]': 'effectiveHeaderPosition()',
    '[attr.data-z-size]': 'effectiveZSize()',
    '[attr.data-stretch-tabs]': 'stretchTabs() ? "true" : null',
    '[attr.data-fit-ink-bar]': 'fitInkBarToContent() ? "true" : null',
  },
})
export class ZardTabGroupComponent implements AfterContentInit, AfterViewInit {
  private readonly tabComponents = contentChildren(ZardTabComponent, { descendants: true });
  private readonly tabsContainer = viewChild.required<ElementRef<HTMLElement>>('tabNav');
  private readonly triggerElements = viewChildren<ElementRef<HTMLElement>>('tabTrigger');
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly window = inject(DOCUMENT).defaultView;

  private readonly requestedSelectedIndex = signal<number | null>(null);
  private readonly renderedTabIndices = signal<number[]>([]);
  private readonly activeTabIndex = signal<number>(-1);
  private readonly scrollPresent = signal<boolean>(false);
  private contentReady = false;
  private hasInitializedSelection = false;

  readonly tabs = computed(() => this.tabComponents());
  readonly zTabChange = new EventEmitter<ZardTabChangeEvent>();
  readonly zDeselect = new EventEmitter<ZardTabChangeEvent>();

  readonly zTabsPosition = input<ZardTabVariants['zPosition']>('top');
  readonly zActivePosition = input<ZardTabVariants['zActivePosition']>('bottom');
  readonly zShowArrow = input(true, { transform: booleanAttribute });
  readonly zScrollAmount = input(100);
  readonly zAlignTabs = input<zAlign>('start');
  readonly zSize = input<ZardTabSizeVariants | null>(null);
  readonly class = input<ClassValue>('');

  readonly preserveContent = input(false, { transform: booleanAttribute });
  readonly headerPosition = input<ZardTabHeaderPosition | null>(null);
  readonly alignTabs = input<zAlign | null>(null);
  readonly stretchTabs = input(false, { transform: booleanAttribute });
  readonly disablePagination = input(false, { transform: booleanAttribute });
  readonly fitInkBarToContent = input(false, { transform: booleanAttribute });
  readonly disableRipple = input(false, { transform: booleanAttribute });
  readonly animationDuration = input<string | number | null>(null);
  readonly color = input<string | null>(null);
  readonly legacyDisplayDensity = input<string | null>(null, { alias: 'displayDensity' });

  @Output() readonly selectedIndexChange = new EventEmitter<number>();
  @Output() readonly selectedTabChange = new EventEmitter<ZardTabChangeEvent>();

  @Input()
  set selectedIndex(value: number | string | null | undefined) {
    const coerced = coerceIndex(value);
    this.requestedSelectedIndex.set(coerced);

    if (this.contentReady) {
      this.syncSelection(this.hasInitializedSelection);
    }
  }
  get selectedIndex(): number {
    return this.activeTabIndex();
  }

  readonly effectiveTabsPosition = computed<zPosition>(() => {
    const headerPosition = this.headerPosition();
    if (headerPosition === 'below') {
      return 'bottom';
    }
    if (headerPosition === 'above') {
      return 'top';
    }

    return this.zTabsPosition();
  });

  readonly effectiveHeaderPosition = computed<ZardTabHeaderPosition>(() =>
    this.effectiveTabsPosition() === 'bottom' ? 'below' : 'above',
  );
  readonly effectiveZSize = computed<ZardTabSizeVariants>(
    () => this.zSize() ?? displayDensityToTabSize(this.legacyDisplayDensity()) ?? 'default',
  );
  readonly effectiveAlignTabs = computed<zAlign>(() => this.alignTabs() ?? this.zAlignTabs());
  readonly showArrow = computed(
    () => this.zShowArrow() && !this.disablePagination() && this.scrollPresent(),
  );
  readonly navBeforeContent = computed(() => {
    const position = this.effectiveTabsPosition();
    return position === 'top' || position === 'left';
  });
  readonly isHorizontal = computed(() => {
    const position = this.effectiveTabsPosition();
    return position === 'top' || position === 'bottom';
  });
  readonly navGridClasses = computed(() => {
    const gridLayout = this.isHorizontal()
      ? 'grid-cols-[25px_minmax(0,1fr)_25px]'
      : 'grid-rows-[25px_minmax(0,1fr)_25px]';

    if (this.showArrow()) {
      return mergeClasses('grid min-h-0 min-w-0', gridLayout);
    }

    return 'grid min-h-0 min-w-0';
  });
  readonly containerClasses = computed(() =>
    mergeClasses(tabContainerVariants({ zPosition: this.effectiveTabsPosition() }), this.class()),
  );
  readonly navClasses = computed(() =>
    mergeClasses(
      tabNavVariants({
        zPosition: this.effectiveTabsPosition(),
        zAlignTabs: this.showArrow() ? 'start' : this.effectiveAlignTabs(),
        zSize: this.effectiveZSize(),
      }),
    ),
  );
  readonly buttonClassesSignal = computed(() => {
    const activeIndex = this.activeTabIndex();
    const position = this.zActivePosition();
    const stretchTabs = this.stretchTabs();
    const zSize = this.effectiveZSize();

    return this.tabs().map((tab, index) =>
      mergeClasses(
        tabButtonVariants({
          zActivePosition: position,
          zSize,
          isActive: activeIndex === index,
          isDisabled: tab.disabled(),
          stretchTabs,
        }),
      ),
    );
  });
  readonly panelClasses = computed(() =>
    this.tabs().map(tab => mergeClasses('min-h-0 h-full', tab.bodyClass())),
  );

  constructor() {
    effect(() => {
      this.tabs();
      untracked(() => {
        if (this.contentReady) {
          this.syncSelection(false);
        }
      });
    });
  }

  ngAfterContentInit(): void {
    this.contentReady = true;
    this.syncSelection(false);
    this.hasInitializedSelection = true;
  }

  ngAfterViewInit(): void {
    runInInjectionContext(this.injector, () => {
      const observeInputs$ = merge(
        toObservable(this.zShowArrow),
        toObservable(this.tabs),
        toObservable(this.effectiveTabsPosition),
        toObservable(this.disablePagination),
        toObservable(this.stretchTabs),
      );

      let observedEl: HTMLElement | null = null;
      const tabNavEl$ = toObservable(this.tabsContainer).pipe(
        map(ref => ref.nativeElement as HTMLElement),
        distinctUntilChanged(),
      );

      afterNextRender(() => {
        if (!this.window || typeof ResizeObserver === 'undefined') {
          return;
        }

        const resizeObserver = new ResizeObserver(() => this.setScrollState());

        tabNavEl$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(el => {
          if (observedEl) {
            resizeObserver.unobserve(observedEl);
          }
          observedEl = el;
          resizeObserver.observe(el);
          this.setScrollState();
        });

        merge(observeInputs$, fromEvent(this.window, 'resize'))
          .pipe(debounceTime(10), takeUntilDestroyed(this.destroyRef))
          .subscribe(() => this.setScrollState());

        this.destroyRef.onDestroy(() => resizeObserver.disconnect());
      });
    });
  }

  isActive(index: number): boolean {
    return this.activeTabIndex() === index;
  }

  shouldRenderTab(index: number): boolean {
    if (this.isActive(index)) {
      return true;
    }

    return this.preserveContent() && this.renderedTabIndices().includes(index);
  }

  onTabInteraction(index: number): void {
    if (this.tabs()[index]?.disabled()) {
      return;
    }

    this.selectTabByIndex(index);
  }

  onTriggerKeydown(event: KeyboardEvent, index: number): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onTabInteraction(index);
      return;
    }

    const delta = getNavigationDelta(event.key, this.isHorizontal());
    if (delta === null) {
      if (event.key === 'Home') {
        event.preventDefault();
        this.focusEnabledTab(0, 1);
      } else if (event.key === 'End') {
        event.preventDefault();
        this.focusEnabledTab(this.tabs().length - 1, -1);
      }
      return;
    }

    event.preventDefault();
    this.focusEnabledTab(index + delta, delta);
  }

  scrollNav(direction: 'left' | 'right' | 'up' | 'down'): void {
    const container = this.tabsContainer().nativeElement;
    const scrollAmount = this.zScrollAmount();

    if (direction === 'left') {
      container.scrollLeft -= scrollAmount;
    } else if (direction === 'right') {
      container.scrollLeft += scrollAmount;
    } else if (direction === 'up') {
      container.scrollTop -= scrollAmount;
    } else if (direction === 'down') {
      container.scrollTop += scrollAmount;
    }
  }

  realignInkBar(): void {
    this.setScrollState();
  }

  selectTabByIndex(index: number): void {
    this.requestedSelectedIndex.set(index);
    this.syncSelection(true);
  }

  private syncSelection(emitChanges: boolean): void {
    const nextIndex = this.resolveNextIndex();
    if (nextIndex === -1) {
      this.activeTabIndex.set(-1);
      this.renderedTabIndices.set([]);
      return;
    }

    const previousIndex = this.activeTabIndex();
    if (nextIndex === previousIndex) {
      this.ensureRendered(nextIndex);
      return;
    }

    const nextTab = this.tabs()[nextIndex];
    if (!nextTab) {
      return;
    }

    if (emitChanges && previousIndex > -1) {
      const previousTab = this.tabs()[previousIndex];
      if (previousTab) {
        this.emitDeselect(previousIndex, previousTab);
      }
    }

    this.activeTabIndex.set(nextIndex);
    this.ensureRendered(nextIndex);

    if (emitChanges) {
      this.emitSelect(nextIndex, nextTab);
    }
  }

  private ensureRendered(index: number): void {
    if (!this.preserveContent()) {
      this.renderedTabIndices.set([index]);
      return;
    }

    if (!this.renderedTabIndices().includes(index)) {
      this.renderedTabIndices.update(indices => [...indices, index]);
    }
  }

  private resolveNextIndex(): number {
    const tabs = this.tabs();
    if (!tabs.length) {
      return -1;
    }

    const requestedIndex = this.requestedSelectedIndex();
    if (requestedIndex !== null && requestedIndex >= 0 && requestedIndex < tabs.length) {
      if (!tabs[requestedIndex].disabled()) {
        return requestedIndex;
      }
    }

    const firstEnabledIndex = tabs.findIndex(tab => !tab.disabled());
    if (firstEnabledIndex > -1) {
      return firstEnabledIndex;
    }

    if (requestedIndex !== null && requestedIndex >= 0 && requestedIndex < tabs.length) {
      return requestedIndex;
    }

    return 0;
  }

  private emitSelect(index: number, tab: ZardTabComponent): void {
    const event = createChangeEvent(index, tab);
    this.zTabChange.emit(event);
    this.selectedTabChange.emit(event);
    this.selectedIndexChange.emit(index);
  }

  private emitDeselect(index: number, tab: ZardTabComponent): void {
    this.zDeselect.emit(createChangeEvent(index, tab));
  }

  private setScrollState(): void {
    if (this.hasScroll() !== this.scrollPresent()) {
      this.scrollPresent.set(this.hasScroll());
    }
  }

  private hasScroll(): boolean {
    const navElement = this.tabsContainer()?.nativeElement;
    if (!navElement || !this.zShowArrow() || this.disablePagination()) {
      return false;
    }

    return navElement.scrollWidth > navElement.clientWidth || navElement.scrollHeight > navElement.clientHeight;
  }

  private focusEnabledTab(startIndex: number, step: number): void {
    const tabs = this.tabs();
    if (!tabs.length) {
      return;
    }

    let index = startIndex;
    while (index >= 0 && index < tabs.length) {
      if (!tabs[index].disabled()) {
        const trigger = this.triggerElements()[index]?.nativeElement;
        trigger?.focus();
        return;
      }
      index += step;
    }
  }
}

function coerceIndex(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const index = Number(value);
  return Number.isFinite(index) ? Math.trunc(index) : null;
}

function createChangeEvent(index: number, tab: ZardTabComponent): ZardTabChangeEvent {
  return {
    index,
    label: tab.label() ?? '',
    tab,
  };
}

function getNavigationDelta(key: string, isHorizontal: boolean): number | null {
  if (isHorizontal) {
    if (key === 'ArrowRight') {
      return 1;
    }
    if (key === 'ArrowLeft') {
      return -1;
    }
    return null;
  }

  if (key === 'ArrowDown') {
    return 1;
  }
  if (key === 'ArrowUp') {
    return -1;
  }

  return null;
}

function displayDensityToTabSize(displayDensity: string | null | undefined): ZardTabSizeVariants | null {
  switch (displayDensity) {
    case 'compact':
      return 'sm';
    case 'comfortable':
      return 'lg';
    case 'cosy':
    case 'default':
      return 'default';
    default:
      return null;
  }
}
