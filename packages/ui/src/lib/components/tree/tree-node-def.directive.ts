import { Directive, input, TemplateRef } from '@angular/core';

import type { ZardTreeNodeOutletContext, ZardTreeNodePredicate } from './tree.types';

@Directive({
  selector: '[zTreeNodeDef]',
  exportAs: 'zTreeNodeDef',
})
export class ZardTreeNodeDefDirective<F = unknown> {
  readonly zTreeNodeDef = input<unknown>(undefined);
  readonly when = input<ZardTreeNodePredicate<any> | undefined>(undefined, { alias: 'zTreeNodeDefWhen' });

  constructor(readonly template: TemplateRef<ZardTreeNodeOutletContext<any>>) {}

  static ngTemplateContextGuard<T>(
    _directive: ZardTreeNodeDefDirective<T>,
    context: unknown,
  ): context is ZardTreeNodeOutletContext<any> {
    return true;
  }
}
