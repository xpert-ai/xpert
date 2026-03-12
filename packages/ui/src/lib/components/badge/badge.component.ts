import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { badgeVariants, type ZardBadgeShapeVariants, type ZardBadgeTypeVariants } from './badge.variants';

@Component({
  selector: 'z-badge',
  template: `
    <ng-content />
    @if (isAttached() && !zHidden()) {
      <span [class]="countClasses()">
        {{ zCount() }}
      </span>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'hostClasses()',
  },
  exportAs: 'zBadge',
})
export class ZardBadgeComponent {
  readonly zType = input<ZardBadgeTypeVariants>('default');
  readonly zShape = input<ZardBadgeShapeVariants>('default');
  readonly zCount = input<string | number | null>(null);
  readonly zHidden = input(false, { transform: booleanAttribute });
  readonly zOverlap = input(true, { transform: booleanAttribute });

  readonly class = input<ClassValue>('');
  readonly zCountClass = input<ClassValue>('');

  protected readonly isAttached = computed(() => this.zCount() !== null);

  protected readonly hostClasses = computed(() =>
    this.isAttached()
      ? mergeClasses('relative inline-flex w-fit overflow-visible', this.class())
      : mergeClasses(badgeVariants({ zType: this.zType(), zShape: this.zShape() }), this.class()),
  );

  protected readonly countClasses = computed(() =>
    mergeClasses(
      'z-badge__count pointer-events-none absolute top-0 right-0 z-10 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none whitespace-nowrap text-primary-foreground shadow-sm ring-2 ring-background',
      this.zOverlap() ? 'translate-x-1/2 -translate-y-1/2' : 'translate-x-full -translate-y-1/2',
      this.zCountClass(),
    ),
  );
}
