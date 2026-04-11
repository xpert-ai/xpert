import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  input,
  output,
  type TemplateRef,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ZardButtonComponent } from '../button/button.component';
import { ZardIdDirective, ZardStringTemplateOutletDirective } from '../../core';
import { mergeClasses } from '../../utils/merge-classes';

import {
  cardActionVariants,
  cardBodyVariants,
  cardDescriptionVariants,
  cardFooterVariants,
  cardHeaderVariants,
  cardPrimitiveActionsVariants,
  cardPrimitiveAvatarVariants,
  cardPrimitiveContentVariants,
  cardPrimitiveFooterVariants,
  cardPrimitiveHeaderVariants,
  cardPrimitiveSubtitleVariants,
  cardPrimitiveTitleVariants,
  cardTitleVariants,
  cardVariants,
} from './card.variants';

@Component({
  selector: 'z-card',
  imports: [ZardStringTemplateOutletDirective, ZardButtonComponent, ZardIdDirective],
  template: `
    @if (hasGeneratedLayout()) {
      <ng-container zardId="card" #z="zardId">
        @let title = zTitle();
        @if (title) {
          <div [class]="headerClasses()" data-slot="card-header">
            <div [class]="titleClasses()" [id]="titleId()" data-slot="card-title">
              <ng-container *zStringTemplateOutlet="title">{{ title }}</ng-container>
            </div>

            @let description = zDescription();
            @if (description) {
              <div [class]="descriptionClasses()" [id]="descriptionId()" data-slot="card-description">
                <ng-container *zStringTemplateOutlet="description">{{ description }}</ng-container>
              </div>
            }

            @let action = zAction();
            @if (action) {
              <button
                z-button
                type="button"
                zType="link"
                [class]="actionClasses()"
                data-slot="card-action"
                (click)="onClick()"
              >
                {{ action }}
              </button>
            }
          </div>
        }

        <div [class]="bodyClasses()" data-slot="card-content">
          <ng-content />
        </div>

        <div [class]="footerClasses()" data-slot="card-footer">
          <ng-content select="[card-footer]" />
        </div>
      </ng-container>
    } @else {
      <ng-content />
    }
  `,
  styles: `
    [data-slot='card-footer']:empty,
    [data-slot='card-actions']:empty {
      display: none;
    }

    [data-slot='card']:has(> z-card-header),
    [data-slot='card']:has(> z-card-content),
    [data-slot='card']:has(> z-card-footer),
    [data-slot='card']:has(> z-card-actions) {
      gap: 0;
      padding-top: 0;
      padding-bottom: 0;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'card',
    '[class]': 'classes()',
    '[attr.aria-labelledby]': 'titleId()',
    '[attr.aria-describedby]': 'descriptionId()',
  },
  exportAs: 'zCard',
})
export class ZardCardComponent {
  private readonly generatedId = viewChild<ZardIdDirective>('z');

  readonly class = input<ClassValue>('');
  readonly zFooterBorder = input(false);
  readonly zHeaderBorder = input(false);
  readonly zAction = input('');
  readonly zDescription = input<string | TemplateRef<void>>();
  readonly zTitle = input<string | TemplateRef<void>>();

  readonly zActionClick = output<void>();

  protected readonly titleId = computed(() => {
    const baseId = this.generatedId()?.id();
    return this.zTitle() && baseId ? `${baseId}-title` : null;
  });

  protected readonly descriptionId = computed(() => {
    const baseId = this.generatedId()?.id();
    return this.zDescription() && baseId ? `${baseId}-description` : null;
  });

  protected readonly classes = computed(() => mergeClasses(cardVariants(), this.class()));
  protected readonly actionClasses = computed(() => mergeClasses(cardActionVariants()));
  protected readonly bodyClasses = computed(() => mergeClasses(cardBodyVariants()));
  protected readonly descriptionClasses = computed(() => mergeClasses(cardDescriptionVariants()));
  protected readonly footerClasses = computed(() =>
    mergeClasses(cardFooterVariants(), this.zFooterBorder() ? 'border-t' : ''),
  );
  protected readonly headerClasses = computed(() =>
    mergeClasses(cardHeaderVariants(), this.zHeaderBorder() ? 'border-b' : ''),
  );
  protected readonly hasGeneratedLayout = computed(
    () => !!(this.zTitle() || this.zDescription() || this.zAction() || this.zHeaderBorder() || this.zFooterBorder()),
  );
  protected readonly titleClasses = computed(() => mergeClasses(cardTitleVariants()));

  protected onClick(): void {
    this.zActionClick.emit();
  }
}

@Component({
  selector: 'z-card-header',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-slot]': '"card-header"',
  },
  exportAs: 'zCardHeader',
})
export class ZardCardHeaderComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveHeaderVariants(), this.class()));
}

@Component({
  selector: 'z-card-title',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-slot]': '"card-title"',
  },
  exportAs: 'zCardTitle',
})
export class ZardCardTitleComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveTitleVariants(), this.class()));
}

@Component({
  selector: 'z-card-subtitle',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-slot]': '"card-description"',
  },
  exportAs: 'zCardSubtitle',
})
export class ZardCardSubtitleComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveSubtitleVariants(), this.class()));
}

@Component({
  selector: 'z-card-content',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-slot]': '"card-content"',
  },
  exportAs: 'zCardContent',
})
export class ZardCardContentComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveContentVariants(), this.class()));
}

@Component({
  selector: 'z-card-footer',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-slot]': '"card-footer"',
  },
  exportAs: 'zCardFooter',
})
export class ZardCardFooterComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveFooterVariants(), this.class()));
}

@Component({
  selector: 'z-card-actions',
  template: '<ng-content />',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()',
    '[attr.data-slot]': '"card-actions"',
  },
  exportAs: 'zCardActions',
})
export class ZardCardActionsComponent {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveActionsVariants(), this.class()));
}

@Directive({
  selector: '[z-card-avatar]',
  host: {
    '[class]': 'classes()',
    'data-slot': 'card-avatar',
  },
})
export class ZardCardAvatarDirective {
  readonly class = input<ClassValue>('');

  protected readonly classes = computed(() => mergeClasses(cardPrimitiveAvatarVariants(), this.class()));
}
