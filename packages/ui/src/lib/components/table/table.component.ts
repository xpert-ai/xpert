import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
  output,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ZardIconComponent } from '@/src/lib/components/icon';
import {
  type ZardTableSizeVariants,
  type ZardTableTypeVariants,
  tableBodyVariants,
  tableCaptionVariants,
  tableCellVariants,
  tableHeaderVariants,
  tableHeadVariants,
  tableRowVariants,
  tableVariants,
} from '@/shared/components/table/table.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

export type ZardTableSortDirection = '' | 'asc' | 'desc';

@Component({
  selector: 'table[z-table]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTable',
})
export class ZardTableComponent {
  readonly zType = input<ZardTableTypeVariants>('default');
  readonly zSize = input<ZardTableSizeVariants>('default');
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() =>
    mergeClasses(
      tableVariants({
        zType: this.zType(),
        zSize: this.zSize(),
      }),
      this.class(),
    ),
  );
}

@Component({
  selector: 'thead[z-table-header]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTableHeader',
})
export class ZardTableHeaderComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableHeaderVariants(), this.class()));
}

@Component({
  selector: 'tbody[z-table-body]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTableBody',
})
export class ZardTableBodyComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableBodyVariants(), this.class()));
}

@Component({
  selector: 'tr[z-table-row]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTableRow',
})
export class ZardTableRowComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableRowVariants(), this.class()));
}

@Component({
  selector: 'th[z-table-head]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTableHead',
})
export class ZardTableHeadComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableHeadVariants(), this.class()));
}

@Component({
  selector: 'td[z-table-cell]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTableCell',
})
export class ZardTableCellComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableCellVariants(), this.class()));
}

@Component({
  selector: 'caption[z-table-caption]',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zTableCaption',
})
export class ZardTableCaptionComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(tableCaptionVariants(), this.class()));
}

@Component({
  selector: 'button[z-table-sort-header]',
  imports: [ZardIconComponent],
  template: `
    <span class="truncate">
      <ng-content />
    </span>
    <z-icon class="size-3.5 shrink-0" [zType]="iconName()" aria-hidden="true" />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    type: 'button',
    '[attr.aria-disabled]': 'zDisabled() ? "true" : null',
    '[class]': 'classes()',
    '[attr.data-direction]': 'zDirection() || null',
    '(click)': 'toggleSort()',
  },
  exportAs: 'zTableSortHeader',
})
export class ZardTableSortHeaderComponent {
  readonly class = input<ClassValue>('');
  readonly zDirection = input<ZardTableSortDirection>('');
  readonly zDisabled = input(false, { transform: booleanAttribute });
  readonly zDisableClear = input(false, { transform: booleanAttribute });

  readonly zSortChange = output<ZardTableSortDirection>();

  protected readonly classes = computed(() =>
    mergeClasses(
      'inline-flex w-full items-center gap-1 whitespace-nowrap rounded-sm text-left text-inherit transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
      this.zDisabled() ? 'pointer-events-none opacity-50' : '',
      this.class(),
    ),
  );

  protected readonly iconName = computed(() => {
    switch (this.zDirection()) {
      case 'asc':
        return 'chevron-up';
      case 'desc':
        return 'chevron-down';
      default:
        return 'chevrons-up-down';
    }
  });

  toggleSort(): void {
    if (this.zDisabled()) {
      return;
    }

    const nextDirection = this.getNextDirection(this.zDirection(), this.zDisableClear());
    this.zSortChange.emit(nextDirection);
  }

  private getNextDirection(direction: ZardTableSortDirection, disableClear: boolean): ZardTableSortDirection {
    switch (direction) {
      case '':
        return 'asc';
      case 'asc':
        return 'desc';
      default:
        return disableClear ? 'asc' : '';
    }
  }
}

@Directive({
  selector: '[zTableStickyStart]',
  standalone: true,
  host: {
    '[class.bg-background]': 'isSticky()',
    '[style.position]': 'isSticky() ? "sticky" : null',
    '[style.left]': 'offset()',
    '[style.zIndex]': 'zIndex()',
    '[attr.data-sticky-start]': 'offset()',
  },
  exportAs: 'zTableStickyStart',
})
export class ZardTableStickyStartDirective {
  readonly zTableStickyStart = input<string | number | null>(0);
  readonly zTableStickyZIndex = input<string | number | null>(1);

  protected readonly offset = computed(() => toCssLength(this.zTableStickyStart()));
  protected readonly zIndex = computed(() => toCssNumber(this.zTableStickyZIndex(), '1'));
  protected readonly isSticky = computed(() => this.offset() !== null);
}

@Directive({
  selector: '[zTableStickyEnd]',
  standalone: true,
  host: {
    '[class.bg-background]': 'isSticky()',
    '[style.position]': 'isSticky() ? "sticky" : null',
    '[style.right]': 'offset()',
    '[style.zIndex]': 'zIndex()',
    '[attr.data-sticky-end]': 'offset()',
  },
  exportAs: 'zTableStickyEnd',
})
export class ZardTableStickyEndDirective {
  readonly zTableStickyEnd = input<string | number | null>(0);
  readonly zTableStickyZIndex = input<string | number | null>(1);

  protected readonly offset = computed(() => toCssLength(this.zTableStickyEnd()));
  protected readonly zIndex = computed(() => toCssNumber(this.zTableStickyZIndex(), '1'));
  protected readonly isSticky = computed(() => this.offset() !== null);
}

function toCssLength(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return `${value}px`;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  return /^-?\d+(\.\d+)?$/.test(trimmed) ? `${trimmed}px` : trimmed;
}

function toCssNumber(value: string | number | null | undefined, fallback: string): string {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  return String(value);
}
