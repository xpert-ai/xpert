import { computed, Directive, forwardRef, inject, input } from '@angular/core'
import { XP_DIALOG_ACTION_CONTEXT, XP_DIALOG_CONTEXT, type XpDialogActionRole } from './dialog-context'

@Directive({
  selector: '[xpDialogActionGroup]',
  standalone: true,
  providers: [{ provide: XP_DIALOG_ACTION_CONTEXT, useExisting: forwardRef(() => XpDialogActionGroupDirective) }],
  host: {
    '[attr.data-dialog-action-group]': 'xpDialogActionGroup()'
  }
})
export class XpDialogActionGroupDirective {
  private readonly dialog = inject(XP_DIALOG_CONTEXT, { optional: true })
  readonly xpDialogActionGroup = input.required<XpDialogActionRole | null>()
  readonly role = computed(() => this.xpDialogActionGroup() ?? undefined)
  readonly purpose = computed(() => (this.role() === 'footer' ? (this.dialog?.purpose() ?? 'standard') : 'standard'))
}
