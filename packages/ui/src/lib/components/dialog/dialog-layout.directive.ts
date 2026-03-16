import { Directive, computed, input } from '@angular/core';

import { mergeClasses } from '../../utils/merge-classes';

@Directive({
  selector: '[xpDialogTitle]',
  standalone: true,
  host: {
    class: 'block',
  },
})
export class XpDialogTitleDirective {}

@Directive({
  selector: 'xp-dialog-content,[xpDialogContent]',
  standalone: true,
  host: {
    class: 'block flex-1',
  },
})
export class XpDialogContentDirective {}

@Directive({
  selector: 'xp-dialog-actions,[xpDialogActions]',
  standalone: true,
  host: {
    '[class]': 'classes()',
  },
})
export class XpDialogActionsDirective {
  readonly align = input<'center' | 'end' | 'start'>('start');

  protected readonly classes = computed(() =>
    mergeClasses(
      'mt-4 flex items-center gap-2',
      this.align() === 'center' ? 'justify-center' : '',
      this.align() === 'end' ? 'justify-end' : '',
      this.align() === 'start' ? 'justify-start' : '',
    ),
  );
}
