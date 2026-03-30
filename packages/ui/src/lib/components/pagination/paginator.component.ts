import { FormsModule } from '@angular/forms';
import {
  booleanAttribute,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  EventEmitter,
  inject,
  Input,
  Output,
  input,
  numberAttribute,
  OnDestroy,
  OnInit,
  signal,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';
import { Observable, ReplaySubject } from 'rxjs';

import { ZardButtonComponent } from '@/src/lib/components/button';
import { ZardIconComponent } from '@/src/lib/components/icon';
import {
  ZardPaginationContentComponent,
  ZardPaginationItemComponent,
} from '@/src/lib/components/pagination/pagination.component';
import { ZardSelectComponent, ZardSelectItemComponent } from '@/src/lib/components/select';
import { mergeClasses } from '@/shared/utils/merge-classes';

const DEFAULT_PAGE_SIZE = 50;

export interface ZardPageEvent {
  previousPageIndex?: number;
  pageIndex: number;
  pageSize: number;
  length: number;
}

export interface ZardPaginatorLike {
  length: number;
  pageIndex: number;
  pageSize: number;
  pageSizeOptions: number[];
  initialized: Observable<void>;
  page: EventEmitter<ZardPageEvent>;
  firstPage(): void;
  previousPage(): void;
  nextPage(): void;
  lastPage(): void;
  hasPreviousPage(): boolean;
  hasNextPage(): boolean;
  getNumberOfPages(): number;
}

@Component({
  selector: 'z-paginator',
  imports: [
    FormsModule,
    ZardButtonComponent,
    ZardIconComponent,
    ZardSelectComponent,
    ZardSelectItemComponent,
    ZardPaginationContentComponent,
    ZardPaginationItemComponent,
  ],
  template: `
    <div [class]="containerClasses()">
      @if (!hidePageSize) {
        <div data-slot="paginator-page-size" [class]="pageSizeClasses()">
          @if (!hidePageSizeLabel) {
            <span data-slot="paginator-page-size-label" class="whitespace-nowrap text-current/80">
              Items per page:
            </span>
          }

          @if (displayedPageSizeOptions().length > 1) {
            <z-select
              data-slot="paginator-page-size-select"
              [class]="selectClasses()"
              [ngModel]="pageSize"
              [zDisabled]="disabled"
              [zPlaceholder]="'Items per page'"
              (ngModelChange)="changePageSize($event)"
            >
              @for (option of displayedPageSizeOptions(); track option) {
                <z-select-item [zValue]="option">
                  {{ option }}
                </z-select-item>
              }
            </z-select>
          } @else {
            <span data-slot="paginator-page-size-value" class="min-w-8 text-right text-current">
              {{ pageSize }}
            </span>
          }
        </div>
      }

      <div [class]="actionsClasses()">
        <div
          data-slot="paginator-range-label"
          aria-atomic="true"
          aria-live="polite"
          class="whitespace-nowrap text-current/80"
          role="status"
        >
          {{ rangeLabel() }}
        </div>

        <ul z-pagination-content data-slot="paginator-navigation" class="gap-1">
          @if (showFirstLastButtons) {
            <li z-pagination-item>
              <button
                z-button
                type="button"
                data-slot="paginator-first-button"
                zType="ghost"
                [zSize]="buttonSize()"
                [zDisabled]="previousButtonsDisabled()"
                [attr.aria-label]="'First page'"
                [attr.title]="'First page'"
                (click)="firstPage()"
              >
                <z-icon class="z-icon-rtl-mirror" zType="chevrons-left" aria-hidden="true" />
              </button>
            </li>
          }

          <li z-pagination-item>
            <button
              z-button
              type="button"
              data-slot="paginator-previous-button"
              zType="ghost"
              [zSize]="buttonSize()"
              [zDisabled]="previousButtonsDisabled()"
              [attr.aria-label]="'Previous page'"
              [attr.title]="'Previous page'"
              (click)="previousPage()"
            >
              <z-icon class="z-icon-rtl-mirror" zType="chevron-left" aria-hidden="true" />
            </button>
          </li>

          <li z-pagination-item>
            <button
              z-button
              type="button"
              data-slot="paginator-next-button"
              zType="ghost"
              [zSize]="buttonSize()"
              [zDisabled]="nextButtonsDisabled()"
              [attr.aria-label]="'Next page'"
              [attr.title]="'Next page'"
              (click)="nextPage()"
            >
              <z-icon class="z-icon-rtl-mirror" zType="chevron-right" aria-hidden="true" />
            </button>
          </li>

          @if (showFirstLastButtons) {
            <li z-pagination-item>
              <button
                z-button
                type="button"
                data-slot="paginator-last-button"
                zType="ghost"
                [zSize]="buttonSize()"
                [zDisabled]="nextButtonsDisabled()"
                [attr.aria-label]="'Last page'"
                [attr.title]="'Last page'"
                (click)="lastPage()"
              >
                <z-icon class="z-icon-rtl-mirror" zType="chevrons-right" aria-hidden="true" />
              </button>
            </li>
          }
        </ul>
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'paginator',
    '[class]': 'classes()',
    role: 'group',
  },
  exportAs: 'zPaginator',
})
export class ZardPaginatorComponent implements OnInit, OnDestroy, ZardPaginatorLike {
  private readonly changeDetectorRef = inject(ChangeDetectorRef);

  readonly class = input<ClassValue>('');

  readonly initialized = new ReplaySubject<void>(1);
  @Output()
  readonly page = new EventEmitter<ZardPageEvent>();

  private readonly lengthState = signal(0);
  private readonly pageIndexState = signal(0);
  private readonly pageSizeState = signal(0);
  private readonly pageSizeOptionsState = signal<number[]>([]);
  private readonly displayedPageSizeOptionsState = signal<number[]>([]);
  private readonly showFirstLastButtonsState = signal(false);
  private readonly hidePageSizeState = signal(false);
  private readonly hidePageSizeLabelState = signal(false);
  private readonly disabledState = signal(false);
  private readonly displayDensityState = signal<string | null>(null);

  private isInitialized = false;

  @Input({ transform: numberAttribute })
  get length(): number {
    return this.lengthState();
  }
  set length(value: number) {
    this.lengthState.set(Math.max(value || 0, 0));
    this.markForUpdate();
  }

  @Input({ transform: numberAttribute })
  get pageIndex(): number {
    return this.pageIndexState();
  }
  set pageIndex(value: number) {
    this.pageIndexState.set(Math.max(value || 0, 0));
    this.markForUpdate();
  }

  @Input({ transform: numberAttribute })
  get pageSize(): number {
    return this.pageSizeState();
  }
  set pageSize(value: number) {
    this.pageSizeState.set(Math.max(value || 0, 0));
    this.syncDisplayedPageSizeOptions();
    this.markForUpdate();
  }

  @Input()
  get pageSizeOptions(): number[] {
    return this.pageSizeOptionsState();
  }
  set pageSizeOptions(value: number[] | null | undefined) {
    const nextValue = Array.isArray(value)
      ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0)
      : [];

    this.pageSizeOptionsState.set(nextValue);
    this.syncDisplayedPageSizeOptions();
    this.markForUpdate();
  }

  @Input({ transform: booleanAttribute })
  get showFirstLastButtons(): boolean {
    return this.showFirstLastButtonsState();
  }
  set showFirstLastButtons(value: boolean) {
    this.showFirstLastButtonsState.set(value);
    this.markForUpdate();
  }

  @Input({ transform: booleanAttribute })
  get hidePageSize(): boolean {
    return this.hidePageSizeState();
  }
  set hidePageSize(value: boolean) {
    this.hidePageSizeState.set(value);
    this.markForUpdate();
  }

  @Input({ transform: booleanAttribute })
  get hidePageSizeLabel(): boolean {
    return this.hidePageSizeLabelState();
  }
  set hidePageSizeLabel(value: boolean) {
    this.hidePageSizeLabelState.set(value);
    this.markForUpdate();
  }

  @Input({ transform: booleanAttribute })
  get disabled(): boolean {
    return this.disabledState();
  }
  set disabled(value: boolean) {
    this.disabledState.set(value);
    this.markForUpdate();
  }

  @Input()
  get displayDensity(): string | null {
    return this.displayDensityState();
  }
  set displayDensity(value: string | null | undefined) {
    this.displayDensityState.set(value ?? null);
    this.markForUpdate();
  }

  protected readonly classes = computed(() =>
    mergeClasses(
      'block w-full text-sm text-muted-foreground',
      this.displayDensityState() === 'compact' ? 'text-xs' : '',
      this.class(),
    ),
  );

  protected readonly containerClasses = computed(() =>
    mergeClasses(
      'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end',
      this.displayDensityState() === 'compact' ? 'gap-1.5' : '',
    ),
  );

  protected readonly pageSizeClasses = computed(() =>
    mergeClasses(
      'flex items-center gap-2',
      this.displayDensityState() === 'compact' ? 'gap-1.5' : '',
    ),
  );

  protected readonly actionsClasses = computed(() =>
    mergeClasses(
      'flex items-center gap-2',
      this.displayDensityState() === 'compact' ? 'gap-1.5' : '',
    ),
  );

  protected readonly selectClasses = computed(() =>
    mergeClasses(
      this.displayDensityState() === 'compact' ? 'w-[72px]' : 'w-[84px]',
    ),
  );

  protected readonly buttonSize = computed(() =>
    this.displayDensityState() === 'compact' ? 'icon-xs' : 'icon-sm',
  );

  protected readonly displayedPageSizeOptions = computed(() => this.displayedPageSizeOptionsState());

  protected readonly rangeLabel = computed(() => {
    const length = this.lengthState();
    const pageSize = this.pageSizeState();
    const pageIndex = this.pageIndexState();

    if (length === 0 || pageSize === 0) {
      return `0 of ${length}`;
    }

    const startIndex = pageIndex * pageSize;
    const endIndex = startIndex < length ? Math.min(startIndex + pageSize, length) : startIndex + pageSize;

    return `${startIndex + 1} \u2013 ${endIndex} of ${length}`;
  });

  ngOnInit(): void {
    this.isInitialized = true;
    this.syncDisplayedPageSizeOptions();
    this.initialized.next();
    this.changeDetectorRef.markForCheck();
  }

  ngOnDestroy(): void {
    this.initialized.complete();
    this.page.complete();
  }

  firstPage(): void {
    this.navigate(0);
  }

  previousPage(): void {
    if (this.hasPreviousPage()) {
      this.navigate(this.pageIndex - 1);
    }
  }

  nextPage(): void {
    if (this.hasNextPage()) {
      this.navigate(this.pageIndex + 1);
    }
  }

  lastPage(): void {
    this.navigate(Math.max(this.getNumberOfPages() - 1, 0));
  }

  hasPreviousPage(): boolean {
    return this.pageIndex >= 1 && this.pageSize !== 0;
  }

  hasNextPage(): boolean {
    const maxPageIndex = this.getNumberOfPages() - 1;
    return this.pageIndex < maxPageIndex && this.pageSize !== 0;
  }

  getNumberOfPages(): number {
    if (!this.pageSize) {
      return 0;
    }

    return Math.ceil(this.length / this.pageSize);
  }

  changePageSize(value: number): void {
    const pageSize = Math.max(Number(value) || 0, 0);
    const previousPageIndex = this.pageIndex;
    const previousPageSize = this.pageSize;

    if (!pageSize || pageSize === previousPageSize) {
      return;
    }

    const startIndex = previousPageIndex * previousPageSize;
    this.pageIndexState.set(Math.floor(startIndex / pageSize) || 0);
    this.pageSizeState.set(pageSize);
    this.syncDisplayedPageSizeOptions();
    this.emitPageEvent(previousPageIndex);
    this.changeDetectorRef.markForCheck();
  }

  protected previousButtonsDisabled(): boolean {
    return this.disabled || !this.hasPreviousPage();
  }

  protected nextButtonsDisabled(): boolean {
    return this.disabled || !this.hasNextPage();
  }

  private navigate(index: number): void {
    if (this.disabled) {
      return;
    }

    const previousPageIndex = this.pageIndex;
    const lastPageIndex = Math.max(this.getNumberOfPages() - 1, 0);
    const nextPageIndex = Math.min(Math.max(index, 0), lastPageIndex);

    if (nextPageIndex !== previousPageIndex) {
      this.pageIndexState.set(nextPageIndex);
      this.emitPageEvent(previousPageIndex);
      this.changeDetectorRef.markForCheck();
    }
  }

  private emitPageEvent(previousPageIndex: number): void {
    this.page.emit({
      previousPageIndex,
      pageIndex: this.pageIndex,
      pageSize: this.pageSize,
      length: this.length,
    });
  }

  private syncDisplayedPageSizeOptions(): void {
    if (!this.isInitialized) {
      return;
    }

    let pageSize = this.pageSizeState();
    const displayedPageSizeOptions = this.pageSizeOptionsState().slice();

    if (!pageSize) {
      pageSize = displayedPageSizeOptions.length > 0 ? displayedPageSizeOptions[0] : DEFAULT_PAGE_SIZE;
      this.pageSizeState.set(pageSize);
    }

    if (displayedPageSizeOptions.indexOf(pageSize) === -1) {
      displayedPageSizeOptions.push(pageSize);
    }

    displayedPageSizeOptions.sort((left, right) => left - right);
    this.displayedPageSizeOptionsState.set(displayedPageSizeOptions);
  }

  private markForUpdate(): void {
    this.changeDetectorRef.markForCheck();
  }
}
