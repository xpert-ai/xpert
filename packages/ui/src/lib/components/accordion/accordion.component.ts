import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChildren,
  effect,
  input,
  ViewEncapsulation,
} from '@angular/core';

import type { ClassValue } from 'clsx';

import { ZardAccordionItemComponent } from '@/src/lib/components/accordion/accordion-item.component';
import { accordionVariants } from '@/src/lib/components/accordion/accordion.variants';
import { mergeClasses } from '@/shared/utils/merge-classes';

export type ZardAccordionDisplayMode = 'default' | 'flat';

@Component({
  selector: 'z-accordion',
  template: `
    <ng-content />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    'data-slot': 'accordion',
    '[class]': 'classes()',
    '[attr.data-display-mode]': 'displayMode()',
    '[attr.data-density]': 'displayDensity()',
    '[attr.data-multi]': 'isMultiple() ? "true" : null',
  },
  exportAs: 'zAccordion',
})
export class ZardAccordionComponent {
  readonly items = contentChildren(ZardAccordionItemComponent);

  readonly class = input<ClassValue>('');
  readonly zType = input<'single' | 'multiple'>('single');
  readonly zCollapsible = input(true, { transform: booleanAttribute });
  readonly zDefaultValue = input<string | string[]>('');
  readonly multi = input(false, { transform: booleanAttribute });
  readonly hideToggle = input(false, { transform: booleanAttribute });
  readonly togglePosition = input<'before' | 'after'>('after');
  readonly displayMode = input<ZardAccordionDisplayMode>('default');
  readonly displayDensity = input<string | null>(null);

  readonly isMultiple = computed(() => this.multi() || this.zType() === 'multiple');

  private readonly defaultValue = computed(() => {
    const defaultValue = this.zDefaultValue();
    if (typeof defaultValue === 'string') {
      return defaultValue ? [defaultValue] : [];
    }

    return this.isMultiple() ? defaultValue : defaultValue.slice(0, 1);
  });

  protected readonly classes = computed(() => mergeClasses(accordionVariants(), this.class()));

  constructor() {
    effect(() => {
      const defaultValues = this.defaultValue();
      for (const item of this.items()) {
        item.accordion = this;
        if (!item.hasExpandedInput() && defaultValues.includes(item.value())) {
          item.setExpandedState(true, { emit: true });
        }
      }
    });
  }

  toggleItem(selectedItem: ZardAccordionItemComponent): void {
    if (this.isMultiple()) {
      this.toggleForMultipleType(selectedItem);
      return;
    }

    this.toggleForSingleType(selectedItem);
  }

  openItem(selectedItem: ZardAccordionItemComponent): void {
    if (this.isMultiple()) {
      selectedItem.setExpandedState(true, { emit: true });
      return;
    }

    for (const item of this.items()) {
      item.setExpandedState(item === selectedItem, { emit: true });
    }
  }

  closeItem(selectedItem: ZardAccordionItemComponent): void {
    selectedItem.setExpandedState(false, { emit: true });
  }

  toggleForSingleType(selectedItem: ZardAccordionItemComponent): void {
    const isClosing = selectedItem.expanded;
    if (isClosing && !this.zCollapsible()) {
      return;
    }

    for (const item of this.items()) {
      item.setExpandedState(item === selectedItem ? !isClosing : false, { emit: true });
    }
  }

  toggleForMultipleType(selectedItem: ZardAccordionItemComponent): void {
    const isClosing = selectedItem.expanded;
    if (isClosing && !this.zCollapsible() && this.countOpenItems() <= 1) {
      return;
    }

    selectedItem.setExpandedState(!isClosing, { emit: true });
  }

  private countOpenItems(): number {
    return this.items().reduce((counter, item) => (item.expanded ? counter + 1 : counter), 0);
  }
}
