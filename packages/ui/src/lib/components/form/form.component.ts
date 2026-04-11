import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import {
  formControlVariants,
  formFieldVariants,
  formLabelVariants,
  formMessageVariants,
  type ZardFormFieldAppearanceVariants,
  type ZardFormFieldDisplayDensityVariants,
  type ZardFormMessageTypeVariants,
} from './form.variants';
import { mergeClasses } from '../../utils/merge-classes';

export type ZardFormFieldAppearance = ZardFormFieldAppearanceVariants;
export type ZardFormFieldDisplayDensity = ZardFormFieldDisplayDensityVariants | string | null | undefined;
export type ZardFormFieldFloatLabel = 'always' | 'auto' | 'never' | string | null | undefined;
export type ZardFormFieldColor = 'primary' | 'accent' | 'warn' | string | null | undefined;

@Component({
  selector: 'z-form-field, [z-form-field]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-density]': 'resolvedDisplayDensity()',
  },
  exportAs: 'zFormField',
})
export class ZardFormFieldComponent {
  readonly class = input<ClassValue>('');
  readonly appearance = input<ZardFormFieldAppearance>('fill');
  /**
   * @deprecated use zSize instead.
   */
  readonly displayDensity = input<ZardFormFieldDisplayDensity>('comfortable');
  readonly floatLabel = input<ZardFormFieldFloatLabel>('auto');
  readonly color = input<ZardFormFieldColor>(null);
  readonly hideRequiredMarker = input(false, { transform: booleanAttribute });
  readonly subscriptSizing = input<string | null>(null);

  protected readonly resolvedDisplayDensity = computed<ZardFormFieldDisplayDensityVariants>(() => {
    const value = this.displayDensity();
    return value === 'compact' || value === 'cosy' ? value : 'comfortable';
  });

  protected readonly classes = computed(() =>
    mergeClasses(
      formFieldVariants({
        zAppearance: this.appearance(),
        zDisplayDensity: this.resolvedDisplayDensity(),
      }),
      this.floatLabel() === 'always' ? 'z-form-field--float-always' : null,
      this.floatLabel() === 'never' ? 'z-form-field--float-never' : null,
      this.color() ? `z-form-field--${this.color()}` : null,
      this.hideRequiredMarker() ? 'z-form-field--hide-required-marker' : null,
      this.class(),
    ),
  );
}

@Component({
  selector: 'z-form-control, [z-form-control]',
  imports: [],
  template: `
    <div class="relative">
      <ng-content />
    </div>
    @if (errorMessage() || helpText()) {
      <div class="mt-1.5 min-h-5">
        @if (errorMessage()) {
          <p class="text-sm text-red-500">{{ errorMessage() }}</p>
        } @else if (helpText()) {
          <p class="text-muted-foreground text-sm">{{ helpText() }}</p>
        }
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zFormControl',
})
export class ZardFormControlComponent {
  readonly class = input<ClassValue>('');
  readonly errorMessage = input<string>('');
  readonly helpText = input<string>('');

  protected readonly classes = computed(() => mergeClasses(formControlVariants(), this.class()));
}

@Component({
  selector: 'z-form-label, label[z-form-label]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zFormLabel',
})
export class ZardFormLabelComponent {
  readonly class = input<ClassValue>('');
  readonly zRequired = input(false, { transform: booleanAttribute });

  protected readonly classes = computed(() =>
    mergeClasses(formLabelVariants({ zRequired: this.zRequired() }), this.class()),
  );
}

@Component({
  selector: 'z-form-message, [z-form-message]',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
  },
  exportAs: 'zFormMessage',
})
export class ZardFormMessageComponent {
  readonly class = input<ClassValue>('');
  readonly zType = input<ZardFormMessageTypeVariants>('default');

  protected readonly classes = computed(() =>
    mergeClasses(formMessageVariants({ zType: this.zType() }), this.class()),
  );
}

@Directive({
  selector: '[zFormPrefix]',
  host: {
    class: 'col-start-1 row-start-2 z-10 flex items-center gap-1 self-center pl-3 text-muted-foreground',
  },
})
export class ZardFormPrefixDirective {}

@Directive({
  selector: '[zFormSuffix]',
  host: {
    class: 'col-start-2 row-start-2 flex items-center gap-1 self-center justify-self-end',
  },
})
export class ZardFormSuffixDirective {}
