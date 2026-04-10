import { ChangeDetectionStrategy, Component, computed, inject, input, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';
import { LucideAngularModule } from 'lucide-angular';

import { mergeClasses } from '../../utils/merge-classes';

import { ZARD_ICON_ASSETS, mergeZardIconAssets } from './icon-assets';
import { iconVariants, type ZardIconSizeVariants } from './icon.variants';
import { resolveLegacyIcon } from './legacy-icons';
import { ZARD_ICONS, type ZardIcon } from './icons';

@Component({
  selector: 'z-icon, [z-icon]',
  imports: [LucideAngularModule],
  styles: [
    `
      [dir='rtl'] .z-icon.z-icon-rtl-mirror {
        transform: scaleX(-1);
      }
    `,
  ],
  template: `
    @switch (resolvedIcon()?.kind) {
      @case ('asset') {
        <img [src]="assetSrc()" alt="" [class]="innerClasses()" />
      }
      @case ('class') {
        <i [class]="classIconClasses()" [style.font-size]="'inherit'" [style.line-height]="'inherit'"></i>
      }
      @default {
        @if (resolvedIcon()?.kind === 'lucide') {
          <lucide-angular
            [img]="lucideIcon()"
            [strokeWidth]="zStrokeWidth()"
            [absoluteStrokeWidth]="zAbsoluteStrokeWidth()"
            [class]="innerClasses()"
          />
        }
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-color]': 'color() || null',
  },
})
export class ZardIconComponent {
  private readonly injectedAssets = inject(ZARD_ICON_ASSETS, { optional: true });

  readonly zType = input<ZardIcon | null>(null);
  readonly zSize = input<ZardIconSizeVariants>('default');
  readonly zStrokeWidth = input<number>(2);
  readonly zAbsoluteStrokeWidth = input<boolean>(false);
  readonly svgIcon = input<string | null>(null, { alias: 'svgIcon' });
  readonly color = input<string | null>(null, { alias: 'color' });
  readonly class = input<ClassValue>('');

  private readonly assets = computed(() => mergeZardIconAssets(this.injectedAssets ?? []));

  protected readonly hostClasses = computed(() =>
    mergeClasses(
      'z-icon inline-flex shrink-0 items-center justify-center align-middle',
      iconVariants({ zSize: this.zSize() }),
      this.colorClasses(),
      this.class(),
    ),
  );

  protected readonly innerClasses = computed(() =>
    mergeClasses('size-full shrink-0 object-contain', this.zStrokeWidth() === 0 ? 'stroke-none' : ''),
  );

  protected readonly assetSrc = computed(() => {
    const icon = this.resolvedIcon();
    return icon?.kind === 'asset' ? icon.src : null;
  });

  protected readonly lucideIcon = computed(() => {
    const icon = this.resolvedIcon();
    return icon?.kind === 'lucide' ? icon.icon : null;
  });

  protected readonly classIconName = computed(() => {
    const icon = this.resolvedIcon();
    return icon?.kind === 'class' ? icon.className : '';
  });

  protected readonly classIconClasses = computed(() =>
    mergeClasses(this.innerClasses(), this.classIconName(), 'flex justify-center items-center'),
  );

  protected readonly resolvedIcon = computed(() => {
    const svgIcon = this.svgIcon();
    const type = this.zType();

    if (svgIcon) {
      return resolveLegacyIcon(typeof type === 'string' ? type : null, {
        svgIcon,
        assets: this.assets(),
      });
    }

    if (type && typeof type !== 'string') {
      return { kind: 'lucide', icon: type } as const;
    }

    if (typeof type === 'string' && ZARD_ICONS[type]) {
      return { kind: 'lucide', icon: ZARD_ICONS[type] } as const;
    }

    return resolveLegacyIcon(typeof type === 'string' ? type : null, { assets: this.assets() });
  });

  private readonly colorClasses = computed(() => {
    switch (this.color()) {
      case 'primary':
      case 'accent':
        return 'text-primary-500';
      case 'warn':
        return 'text-red-500';
      case 'success':
        return 'text-green-500';
      default:
        return '';
    }
  });
}
