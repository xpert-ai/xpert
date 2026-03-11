import { booleanAttribute, ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { dividerVariants, type ZardDividerVariants } from './divider.variants';

import { mergeClasses } from '@/shared/utils/merge-classes';

@Component({
  selector: 'z-divider',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[attr.role]': `'separator'`,
    '[attr.aria-orientation]': 'orientation()',
    '[attr.data-orientation]': 'orientation()',
    '[class]': 'classes()',
  },
  exportAs: 'zDivider',
})
export class ZardDividerComponent {
  readonly zOrientation = input<ZardDividerVariants['zOrientation']>('horizontal');
  readonly zVariant = input<ZardDividerVariants['zVariant']>('solid');
  readonly zSpacing = input<ZardDividerVariants['zSpacing']>('none');
  readonly vertical = input(false, {
    alias: 'vertical',
    transform: booleanAttribute,
  });
  readonly class = input<ClassValue>('');

  protected readonly orientation = computed<ZardDividerVariants['zOrientation']>(() =>
    this.vertical() ? 'vertical' : this.zOrientation(),
  );

  protected readonly classes = computed(() =>
    mergeClasses(
      dividerVariants({
        zOrientation: this.orientation(),
        zVariant: this.zVariant(),
        zSpacing: this.zSpacing(),
      }),
      this.class(),
    ),
  );
}
