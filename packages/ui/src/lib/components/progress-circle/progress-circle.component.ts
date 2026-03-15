import { ChangeDetectionStrategy, Component, computed, input, numberAttribute, ViewEncapsulation } from '@angular/core';

import type { ClassValue } from 'clsx';

import { mergeClasses } from '@/shared/utils/merge-classes';

import { progressCircleVariants, type ZardProgressCircleTypeVariants } from './progress-circle.variants';

@Component({
  selector: 'z-progress-circle',
  template: `
    <svg [attr.width]="diameter()" [attr.height]="diameter()" [attr.viewBox]="viewBox()">
      <circle
        class="stroke-current opacity-20"
        fill="none"
        [attr.cx]="center()"
        [attr.cy]="center()"
        [attr.r]="radius()"
        [attr.stroke-width]="strokeWidth()"
      />
      <circle
        class="stroke-current transition-[stroke-dashoffset] duration-300 ease-linear"
        fill="none"
        [attr.cx]="center()"
        [attr.cy]="center()"
        [attr.r]="radius()"
        [attr.stroke-width]="strokeWidth()"
        [attr.stroke-dasharray]="circumference()"
        [attr.stroke-dashoffset]="dashOffset()"
        stroke-linecap="round"
        [style.transform]="'rotate(-90deg)'"
        [style.transform-origin]="'center'"
      />
    </svg>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    role: 'progressbar',
    '[attr.aria-valuenow]': 'clampedValue()',
    '[attr.aria-valuemin]': '0',
    '[attr.aria-valuemax]': '100',
  },
  exportAs: 'zProgressCircle',
})
export class ZardProgressCircleComponent {
  readonly class = input<ClassValue>('');
  readonly zType = input<ZardProgressCircleTypeVariants>('default');
  readonly value = input(0, { transform: numberAttribute });
  readonly diameter = input(24, { transform: numberAttribute });
  readonly strokeWidth = input(2, { transform: numberAttribute });

  protected readonly clampedValue = computed(() => Math.max(0, Math.min(100, this.value())));
  protected readonly center = computed(() => this.diameter() / 2);
  protected readonly radius = computed(() => (this.diameter() - this.strokeWidth()) / 2);
  protected readonly circumference = computed(() => 2 * Math.PI * this.radius());
  protected readonly dashOffset = computed(() => this.circumference() * (1 - this.clampedValue() / 100));
  protected readonly viewBox = computed(() => `0 0 ${this.diameter()} ${this.diameter()}`);

  protected readonly classes = computed(() =>
    mergeClasses(progressCircleVariants({ zType: this.zType() }), this.class()),
  );
}
