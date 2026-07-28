import { ChangeDetectionStrategy, Component, computed, input, ViewEncapsulation } from '@angular/core'

import type { ClassValue } from 'clsx'

import { menuShortcutVariants } from './menu.variants'
import { mergeClasses } from '../../utils/merge-classes'

@Component({
  selector: 'z-menu-shortcut, [z-menu-shortcut]',
  template: ` <ng-content /> `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    '[class]': 'classes()'
  },
  exportAs: 'zMenuShortcut'
})
export class ZardMenuShortcutComponent {
  readonly class = input<ClassValue>('')

  protected readonly classes = computed(() => mergeClasses(menuShortcutVariants(), this.class()))
}
